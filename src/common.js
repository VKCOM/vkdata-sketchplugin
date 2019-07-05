const sketch = require('sketch')
const util = require('util')
const os = require('os')
const path = require('path')
const fs = require('@skpm/fs')
const track = require('./analytics.js')
const MochaJSDelegate = require('mocha-js-delegate')

const {
  DataSupplier,
  UI,
  Settings
} = sketch

const APP_ID = '6742961'
const REDIRECT_URI = 'https://oauth.vk.com/blank.html'
const SCOPE = 'offline,friends,groups,video'
const API_URI = 'https://api.vk.com/method/'
const API_VERSION = '5.101'
const DEBUG_MODE = false

const SETTING_KEY = 'vk.photo.id'
const FOLDER = path.join(os.tmpdir(), 'com.vk.data-plugin')

const ACCESS_TOKEN = Settings.settingForKey('ACCESS_TOKEN')
const USER_ID = Settings.settingForKey('USER_ID')

export function checkauth () {
  if (ACCESS_TOKEN === undefined || Settings.settingForKey('SCOPE_KEY') !== SCOPE) {
    auth()
  } else {
    UI.message('You can use the plugin')
  }
}

function sendEvent (category, action, value) {
  let analytics = track('UA-130190471-1', 'event', {
    ec: category, // the event category
    ea: action + ' ' + value // the event action
  }, { debug: DEBUG_MODE })
  if (DEBUG_MODE) console.log(analytics)
  return analytics
}

function auth () {
  let authURL = 'https://oauth.vk.com/authorize?client_id=' + APP_ID + '&display=page&redirect_uri=' + REDIRECT_URI + '&scope=' + SCOPE + '&response_type=token&v=' + API_VERSION + '&revoke=1'
  let panelWidth = 800
  let panelHeight = 600

  let fiber = sketch.Async.createFiber()
  let frame = NSMakeRect(0, 0, panelWidth, panelHeight)
  let mask = NSTitledWindowMask + NSClosableWindowMask
  let panel = NSPanel.alloc().initWithContentRect_styleMask_backing_defer(frame, mask, NSBackingStoreBuffered, true)

  panel.setBackgroundColor(NSColor.whiteColor())

  panel.title = 'VK Data Plugin'
  panel.titlebarAppearsTransparent = false

  panel.center()
  panel.becomeKeyWindow()
  panel.makeKeyAndOrderFront(null)

  panel.standardWindowButton(NSWindowMiniaturizeButton).setHidden(true)
  panel.standardWindowButton(NSWindowZoomButton).setHidden(true)

  let config = WKWebViewConfiguration.alloc().init()
  config.setWebsiteDataStore(WKWebsiteDataStore.nonPersistentDataStore())

  let webView = WKWebView.alloc().initWithFrame_configuration(frame, config)
  let request = NSURLRequest.requestWithURL(NSURL.URLWithString(authURL))

  let delegate = new MochaJSDelegate({
    'webView:didCommitNavigation:': function (webView) {
      let components = NSURLComponents.componentsWithURL_resolvingAgainstBaseURL(webView.URL(), false)
      // eslint-disable-next-line eqeqeq
      if (components.path() == '/blank.html') {
        let fragment = components.fragment()
        let url = NSURL.URLWithString('https://vk.com/?' + String(fragment))
        let queryItems = NSURLComponents.componentsWithURL_resolvingAgainstBaseURL(url, false).queryItems()
        let values = queryItems.reduce(function (prev, item) {
          prev[String(item.name())] = String(item.value())
          return prev
        }, {})

        let token = values['access_token']
        let userId = values['user_id']

        if (token.length > 0) {
          Settings.setSettingForKey('ACCESS_TOKEN', token)
          Settings.setSettingForKey('USER_ID', userId)
          Settings.setSettingForKey('SCOPE_KEY', SCOPE)

          panel.close()
          fiber.cleanup()
        }
      }
    }
  })

  webView.setNavigationDelegate(delegate.getClassInstance())
  webView.loadRequest(request)
  panel.contentView().addSubview(webView)
}

export function logout (context) {
  Settings.setSettingForKey('ACCESS_TOKEN', undefined)
  Settings.setSettingForKey('USER_ID', undefined)
  Settings.setSettingForKey('SCOPE_KEY', undefined)
  auth()
}

export function onStartup (context) {
  DataSupplier.registerDataSupplier('public.image', 'Your Avatar or..', 'PhotoByUserID')
  DataSupplier.registerDataSupplier('public.image', 'Friends: Hints', 'MyFriends')
  DataSupplier.registerDataSupplier('public.image', 'Friends: Random', 'MyFriendsRandom')
  DataSupplier.registerDataSupplier('public.image', 'Groups: Hints', 'MyGroups')
  DataSupplier.registerDataSupplier('public.image', 'Groups: Random', 'MyGroupsRandom')
  DataSupplier.registerDataSupplier('public.image', 'Video by..', 'VideoByOwnerID')
  DataSupplier.registerDataSupplier('public.image', 'Bookmarks: Users', 'BookmarksUsers')
  DataSupplier.registerDataSupplier('public.image', 'Bookmarks: Groups', 'BookmarksGroups')

  DataSupplier.registerDataSupplier('public.text', 'Your Name', 'MyName')
  DataSupplier.registerDataSupplier('public.text', 'Friends Hints: First Name', 'MyFriendsFirstNames')
  DataSupplier.registerDataSupplier('public.text', 'Friends Hints: Last Name', 'MyFriendsLastNames')
  DataSupplier.registerDataSupplier('public.text', 'Friends Hints: Full Name', 'MyFriendsFullNames')
  DataSupplier.registerDataSupplier('public.text', 'Friends: Random', 'MyFriendsNamesRandom')
  DataSupplier.registerDataSupplier('public.text', 'Groups: Hints', 'MyGroupsNames')
  DataSupplier.registerDataSupplier('public.text', 'Groups: Random', 'MyGroupsNamesRandom')
  DataSupplier.registerDataSupplier('public.text', 'Video Title by..', 'VideoTitleByOwnerID')
  DataSupplier.registerDataSupplier('public.text', 'Video Views by..', 'VideoViewsByOwnerID')
  DataSupplier.registerDataSupplier('public.text', 'Bookmarks: Users', 'BookmarksUsersNames')
  DataSupplier.registerDataSupplier('public.text', 'Bookmarks: Groups', 'BookmarksGroupsNames')

  if (ACCESS_TOKEN !== undefined) {
    getData('stats.trackVisitor', {
      'access_token': ACCESS_TOKEN,
      'v': API_VERSION
    })
  }
  sendEvent('Launch Sketch')
}

export function onShutdown (context) {
  DataSupplier.deregisterDataSuppliers()
  try {
    fs.rmdirSync(FOLDER)
  } catch (err) {
    console.error(err)
  }
}

export function onPhotoByUserID (context) {
  let recentTerm = Settings.sessionVariable('recentTermPhoto')
  let ownerId = (recentTerm === undefined) ? USER_ID : recentTerm
  if (sketch.version.sketch > 53) {
    UI.getInputFromUser(
      'Enter Account ID of vk.com',
      { initialValue: ownerId },
      (error, value) => {
        if (error) {
          UI.message(error)
          sendEvent('Error', 'User Input', error)
        } else {
          ownerId = value.trim()
          Settings.setSessionVariable('recentTermPhoto', ownerId)
        }
      }
    )
  } else {
    UI.message('Please update your Sketch to use with plugin')
  }

  let requestedCount = context.data.requestedCount
  getData('users.get', {
    'user_ids': ownerId,
    'fields': 'photo_200,photo_100',
    'access_token': ACCESS_TOKEN,
    'v': API_VERSION
  })
    .then(response => {
      let dataKey = context.data.key
      let items = util.toArray(context.data.items).map(sketch.fromNative)
      items.forEach((item, index) => {
        if (!item.type) {
          item = sketch.Shape.fromNative(item.sketchObject)
        }

        if (requestedCount > response.length) {
          let diff = requestedCount - response.length
          for (let i = 0; i < diff; i++) {
            response.push(response[i])
          }
        }

        if (!isEmpty(response[index].photo_200)) {
          process(response[index].photo_200, dataKey, index, item)
        } else {
          process(response[index].photo_100, dataKey, index, item)
        }

        sendEvent('Friends', 'By User ID', null)
      })
    })
    .catch(error => {
      UI.message('Something went wrong')
      console.error(error)
      sendEvent('Error', 'By User ID', error)
    })
}

export function onMyFriends (context) {
  let selection = context.data.requestedCount
  getData('friends.get', {
    'user_id': USER_ID,
    'order': 'hints',
    'fields': 'photo_200,photo_100',
    'access_token': ACCESS_TOKEN,
    'count': selection,
    'v': API_VERSION
  })
    .then(response => {
      let dataKey = context.data.key
      let items = util.toArray(context.data.items).map(sketch.fromNative)
      items.forEach((item, index) => {
        if (!item.type) {
          item = sketch.Shape.fromNative(item.sketchObject)
        }

        if (!isEmpty(response['items'][index].photo_200)) {
          process(response['items'][index].photo_200, dataKey, index, item)
        } else {
          process(response['items'][index].photo_100, dataKey, index, item)
        }

        sendEvent('Friends', 'Hints', null)
      })
    })
    .catch(error => {
      UI.message('Something went wrong')
      console.error(error)
      sendEvent('Error', 'Friends', 'Hints: ' + error)
    })
}

export function onMyGroups (context) {
  let selection = context.data.requestedCount
  getData('groups.get', {
    'user_id': USER_ID,
    'access_token': ACCESS_TOKEN,
    'count': selection,
    'extended': 1,
    'v': API_VERSION
  })
    .then(response => {
      let dataKey = context.data.key
      let items = util.toArray(context.data.items).map(sketch.fromNative)
      items.forEach((item, index) => {
        if (!item.type) {
          item = sketch.Shape.fromNative(item.sketchObject)
        }

        if (!isEmpty(response['items'][index].photo_200)) {
          process(response['items'][index].photo_200, dataKey, index, item)
        } else {
          process(response['items'][index].photo_100, dataKey, index, item)
        }

        sendEvent('Groups', 'Avatar', null)
      })
    })
    .catch(error => {
      UI.message('Something went wrong')
      console.error(error)
      sendEvent('Error', 'Groups', 'Avatar:' + error)
    })
}

export function onMyFriendsFirstNames (context) {
  let selection = context.data.requestedCount
  getData('friends.get', {
    'user_id': USER_ID,
    'order': 'hints',
    'fields': 'first_name',
    'access_token': ACCESS_TOKEN,
    'count': selection,
    'v': API_VERSION
  })
    .then(response => {
      let dataKey = context.data.key
      let items = util.toArray(context.data.items).map(sketch.fromNative)
      items.forEach((item, index) => {
        if (!item.type) {
          item = sketch.Shape.fromNative(item.sketchObject)
        }

        DataSupplier.supplyDataAtIndex(dataKey, response['items'][index].first_name, index)
        sendEvent('Friends', 'First Names', null)
      })
    })
    .catch(error => {
      UI.message('Something went wrong')
      console.error(error)
      sendEvent('Error', 'Friends', 'First Names: ' + error)
    })
}

export function onMyFriendsLastNames (context) {
  let selection = context.data.requestedCount
  getData('friends.get', {
    'user_id': USER_ID,
    'order': 'hints',
    'fields': 'last_name',
    'access_token': ACCESS_TOKEN,
    'count': selection,
    'v': API_VERSION
  })
    .then(response => {
      let dataKey = context.data.key
      let items = util.toArray(context.data.items).map(sketch.fromNative)
      items.forEach((item, index) => {
        if (!item.type) {
          item = sketch.Shape.fromNative(item.sketchObject)
        }
        DataSupplier.supplyDataAtIndex(dataKey, response['items'][index].last_name, index)

        sendEvent('Friends', 'Last Names', null)
      })
    })
    .catch(error => {
      UI.message('Something went wrong')
      console.error(error)
      sendEvent('Error', 'Friends', 'Last Names: ' + error)
    })
}

export function onMyFriendsFullNames (context) {
  let selection = context.data.requestedCount
  getData('friends.get', {
    'user_id': USER_ID,
    'order': 'hints',
    'fields': 'first_name',
    'access_token': ACCESS_TOKEN,
    'count': selection,
    'v': API_VERSION
  })
    .then(response => {
      let dataKey = context.data.key
      let items = util.toArray(context.data.items).map(sketch.fromNative)
      items.forEach((item, index) => {
        if (!item.type) {
          item = sketch.Shape.fromNative(item.sketchObject)
        }
        let fullName = response['items'][index].first_name + ' ' + response['items'][index].last_name
        DataSupplier.supplyDataAtIndex(dataKey, fullName, index)

        sendEvent('Friends', 'Full Names', null)
      })
    })
    .catch(error => {
      UI.message('Something went wrong')
      console.error(error)
      sendEvent('Error', 'Friends', 'Full Names: ' + error)
    })
}

export function onMyName (context) {
  getData('users.get', {
    'user_ids': USER_ID,
    'fields': 'first_name,last_name',
    'access_token': ACCESS_TOKEN,
    'v': API_VERSION
  })
    .then(response => {
      let dataKey = context.data.key
      let items = util.toArray(context.data.items).map(sketch.fromNative)
      items.forEach((item, index) => {
        if (!item.type) {
          item = sketch.Shape.fromNative(item.sketchObject)
        }

        let fullName = response[0].first_name + ' ' + response[0].last_name
        DataSupplier.supplyDataAtIndex(dataKey, fullName, index)

        sendEvent('User', 'Names', null)
      })
    })
    .catch(function (error) {
      UI.message('Something went wrong')
      console.error(error)
      sendEvent('Error', 'User', 'Names: ' + error)
    })
}

export function onMyGroupsNames (context) {
  let selection = context.data.requestedCount
  getData('groups.get', {
    'user_id': USER_ID,
    'access_token': ACCESS_TOKEN,
    'count': selection,
    'extended': 1,
    'v': API_VERSION
  })
    .then(response => {
      let dataKey = context.data.key
      let items = util.toArray(context.data.items).map(sketch.fromNative)
      items.forEach((item, index) => {
        if (!item.type) {
          item = sketch.Shape.fromNative(item.sketchObject)
        }

        let name = response['items'][index].name
        DataSupplier.supplyDataAtIndex(dataKey, name, index)

        sendEvent('Groups', 'Names', null)
      })
    })
    .catch(error => {
      UI.message('Something went wrong')
      console.error(error)
      sendEvent('Error', 'Groups', 'Names: ' + error)
    })
}

export function onVideoByOwnerID (context) {
  let selection = context.data.requestedCount
  let recentTerm = Settings.sessionVariable('recentTermVideo')
  let ownerId = (recentTerm === undefined) ? USER_ID : recentTerm
  if (sketch.version.sketch > 53) {
    UI.getInputFromUser(
      'Enter Video Author ID of vk.com',
      { initialValue: ownerId },
      (error, value) => {
        if (error) {
          UI.message(error)
          sendEvent('Error', 'User Input', error)
        } else {
          ownerId = value
          Settings.setSessionVariable('recentTermVideo', ownerId)
        }
      }
    )
  }
  getData('video.get', {
    'owner_id': ownerId,
    'count': selection,
    'access_token': ACCESS_TOKEN,
    'v': API_VERSION
  })
    .then(response => {
      let dataKey = context.data.key
      let items = util.toArray(context.data.items).map(sketch.fromNative)
      items.forEach((item, index) => {
        if (!item.type) {
          item = sketch.Shape.fromNative(item.sketchObject)
        }
        (!isEmpty(response['items'][index].photo_1280)) ? process(response['items'][index].photo_1280, dataKey, index, item)
          : (!isEmpty(response['items'][index].photo_800)) ? process(response['items'][index].photo_800, dataKey, index, item)
            : (!isEmpty(response['items'][index].photo_640)) ? process(response['items'][index].photo_640, dataKey, index, item)
              : (!isEmpty(response['items'][index].photo_320)) ? process(response['items'][index].photo_320, dataKey, index, item)
                : process(response['items'][index].photo_130, dataKey, index, item)

        sendEvent('Video', 'Thumbnails', null)
      })
    })
    .catch(error => {
      UI.message('Something went wrong')
      console.error(error)
      sendEvent('Error', 'Video', 'Thumbnails: ' + error)
    })
}

export function onVideoTitleByOwnerID (context) {
  let selection = context.data.requestedCount
  let recentTerm = Settings.sessionVariable('recentTermVideo')
  let ownerId = (recentTerm === undefined) ? USER_ID : recentTerm
  if (sketch.version.sketch > 53) {
    UI.getInputFromUser(
      'Enter Video Author ID of vk.com',
      { initialValue: ownerId },
      (error, value) => {
        if (error) {
          UI.message(error)
          sendEvent('Error', 'User Input', error)
        } else {
          ownerId = value
          Settings.setSessionVariable('recentTermVideo', ownerId)
        }
      }
    )
  } else {
    UI.message('Please update your Sketch to use with plugin')
  }
  getData('video.get', {
    'owner_id': ownerId,
    'count': selection,
    'access_token': ACCESS_TOKEN,
    'v': API_VERSION
  })
    .then(response => {
      let dataKey = context.data.key
      let items = util.toArray(context.data.items).map(sketch.fromNative)
      items.forEach((item, index) => {
        if (!item.type) {
          item = sketch.Shape.fromNative(item.sketchObject)
        }

        if (selection > response['items'].length) {
          let diff = selection - response['items'].length
          for (let i = 0; i < diff; i++) {
            response['items'].push(response['items'][i])
          }
        }

        let name = response['items'][index].title
        DataSupplier.supplyDataAtIndex(dataKey, name, index)

        sendEvent('Video', 'Title', null)
      })
    })
    .catch(error => {
      UI.message('Something went wrong')
      console.error(error)
      sendEvent('Error', 'Video', 'Title: ' + error)
    })
}

export function onVideoViewsByOwnerID (context) {
  let selection = context.data.requestedCount
  let recentTerm = Settings.sessionVariable('recentTermVideo')
  let ownerId = (recentTerm === undefined) ? USER_ID : recentTerm
  if (sketch.version.sketch > 53) {
    UI.getInputFromUser(
      'Enter Video Author ID of vk.com',
      { initialValue: ownerId },
      (error, value) => {
        if (error) {
          UI.message(error)
          sendEvent('Error', 'User Input', error)
        } else {
          ownerId = value
          Settings.setSessionVariable('recentTermVideo', ownerId)
        }
      }
    )
  } else {
    UI.message('Please update your Sketch to use with plugin')
  }
  getData('video.get', {
    'owner_id': ownerId,
    'count': selection,
    'access_token': ACCESS_TOKEN,
    'v': API_VERSION
  })
    .then(response => {
      let dataKey = context.data.key
      let items = util.toArray(context.data.items).map(sketch.fromNative)
      items.forEach((item, index) => {
        if (!item.type) {
          item = sketch.Shape.fromNative(item.sketchObject)
        }

        let views = response['items'][index].views
        views = views + ' просмотров'
        DataSupplier.supplyDataAtIndex(dataKey, views, index)

        sendEvent('Video', 'Views', null)
      })
    })
    .catch(error => {
      UI.message('Something went wrong')
      console.error(error)
      sendEvent('Error', 'Video', 'Video: ' + error)
    })
}

export function onMyFriendsRandom (context) {
  let selection = context.data.requestedCount

  if ((Settings.sessionVariable('RandomID') === undefined) || (Settings.sessionVariable('RandomType') === 'Image')) {
    getData('friends.get', {
      'user_id': USER_ID,
      'order': 'random',
      'fields': 'photo_200,photo_100',
      'access_token': ACCESS_TOKEN,
      'count': selection,
      'v': API_VERSION
    })
      .then(response => {
        let dataKey = context.data.key
        let items = util.toArray(context.data.items).map(sketch.fromNative)

        let arr = []
        for (let i = 0; i < selection; i++) {
          arr.splice(i, 0, String(response['items'][i].id))
        }
        Settings.setSessionVariable('RandomID', arr)
        Settings.setSessionVariable('RandomType', 'Image')
        items.forEach((item, index) => {
          if (!item.type) {
            item = sketch.Shape.fromNative(item.sketchObject)
          }

          if (!isEmpty(response['items'][index].photo_200)) {
            process(response['items'][index].photo_200, dataKey, index, item)
          } else {
            process(response['items'][index].photo_100, dataKey, index, item)
          }
          UI.message('Now you can add names in Friends: Random')

          sendEvent('Friends', 'Random', null)
        })
      })
      .catch(error => {
        UI.message('Something went wrong')
        console.error(error)
        sendEvent('Error', 'Friends', 'Random, No Cookies: ')
      })
  } else {
    let userids = Settings.sessionVariable('RandomID').join(',')
    getData('users.get', {
      'user_ids': userids,
      'fields': 'photo_200,photo_100',
      'access_token': ACCESS_TOKEN,
      'v': API_VERSION
    })
      .then(response => {
        let dataKey = context.data.key
        let items = util.toArray(context.data.items).map(sketch.fromNative)
        items.forEach((item, index) => {
          if (!item.type) {
            item = sketch.Shape.fromNative(item.sketchObject)
          }

          if (!isEmpty(response[index].photo_200) !== 0) {
            process(response[index].photo_200, dataKey, index, item)
          } else {
            process(response[index].photo_100, dataKey, index, item)
          }

          sendEvent('Friends', 'Random', null)
        })
      })
      .catch(error => {
        UI.message('Something went wrong')
        console.error(error)
        sendEvent('Error', 'Friends', 'Random, Cookies: ' + error)
      })
    Settings.setSessionVariable('RandomID', undefined)
  }
}

export function onMyFriendsNamesRandom (context) {
  let selection = context.data.requestedCount

  if ((Settings.sessionVariable('RandomID') === undefined) || (Settings.sessionVariable('RandomType') === 'Text')) {
    getData('friends.get', {
      'user_id': USER_ID,
      'order': 'random',
      'fields': 'first_name,last_name',
      'access_token': ACCESS_TOKEN,
      'count': selection,
      'v': API_VERSION
    })
      .then(response => {
        let dataKey = context.data.key
        let items = util.toArray(context.data.items).map(sketch.fromNative)

        let arr = []
        for (let i = 0; i < selection; i++) {
          arr.splice(i, 0, String(response['items'][i].id))
        }
        Settings.setSessionVariable('RandomID', arr)
        Settings.setSessionVariable('RandomType', 'Text')

        items.forEach((item, index) => {
          if (!item.type) {
            item = sketch.Shape.fromNative(item.sketchObject)
          }

          let fullName = response['items'][index].first_name + ' ' + response['items'][index].last_name
          DataSupplier.supplyDataAtIndex(dataKey, fullName, index)
          UI.message('Now you can add avatars in Friends: Random')

          sendEvent('Friends', 'Random Names', null)
        })
      })
      .catch(error => {
        UI.message('Something went wrong')
        console.error(error)
        sendEvent('Error', 'Friends', 'Random Names, No Cookies' + error)
      })
  } else {
    let userids = Settings.sessionVariable('RandomID').join(',')
    getData('users.get', {
      'user_ids': userids,
      'fields': 'first_name,last_name',
      'access_token': ACCESS_TOKEN,
      'v': API_VERSION
    })
      .then(response => {
        let dataKey = context.data.key
        let items = util.toArray(context.data.items).map(sketch.fromNative)
        items.forEach((item, index) => {
          if (!item.type) {
            item = sketch.Shape.fromNative(item.sketchObject)
          }

          let fullName = response[index].first_name + ' ' + response[index].last_name
          DataSupplier.supplyDataAtIndex(dataKey, fullName, index)
        })

        sendEvent('Friends', 'Random Names', null)
      })
      .catch(error => {
        UI.message('Something went wrong')
        console.error(error)
        sendEvent('Error', 'Friends', 'Random Names, Cookies' + error)
      })
    Settings.setSessionVariable('RandomID', undefined)
  }
}

function GroupsRandom (context, array) {
  getData('groups.getById', {
    'group_ids': array,
    'access_token': ACCESS_TOKEN,
    'v': API_VERSION
  })
    .then(response => {
      let dataKey = context.data.key
      let items = util.toArray(context.data.items).map(sketch.fromNative)

      items.forEach((item, index) => {
        if (!item.type) {
          item = sketch.Shape.fromNative(item.sketchObject)
        }

        if (!isEmpty(response[index].photo_200)) {
          process(response[index].photo_200, dataKey, index, item)
        } else {
          process(response[index].photo_100, dataKey, index, item)
        }
        sendEvent('Groups', 'Random', null)
      })
    })
    .catch(error => {
      UI.message('Something went wrong')
      console.error(error)
      sendEvent('Error', 'Groups', 'Random: ' + error)
    })
}

export function onMyGroupsRandom (context) {
  let selection = context.data.requestedCount

  if ((Settings.sessionVariable('RandomGroupsID') === undefined) || (Settings.sessionVariable('RandomGroupsType') === 'Image')) {
    getData('groups.get', {
      'user_id': USER_ID,
      'access_token': ACCESS_TOKEN,
      'v': API_VERSION
    })
      .then(response => {
        let arr = response['items']
        arr = shuffle(arr)

        let arrRand = []
        for (let i = 0; i < selection; i++) {
          arrRand.splice(i, 0, String(arr[i]))
        }

        GroupsRandom(context, arrRand)
        UI.message('Now you can add names in Groups: Random')
        Settings.setSessionVariable('RandomGroupsID', arrRand)
        Settings.setSessionVariable('RandomGroupsType', 'Image')
      })
      .catch(error => {
        UI.message('Something went wrong')
        console.error(error)
        sendEvent('Error', 'Groups', 'Random 2: ' + error)
      })
  } else {
    let ids = Settings.sessionVariable('RandomGroupsID')
    GroupsRandom(context, ids)
    Settings.setSessionVariable('RandomGroupsID', undefined)
  }
}

function GroupsNamesRandom (context, array) {
  getData('groups.getById', {
    'group_ids': array,
    'access_token': ACCESS_TOKEN,
    'v': API_VERSION
  })
    .then(response => {
      let dataKey = context.data.key
      let items = util.toArray(context.data.items).map(sketch.fromNative)

      items.forEach((item, index) => {
        if (!item.type) {
          item = sketch.Shape.fromNative(item.sketchObject)
        }

        let name = response[index].name
        DataSupplier.supplyDataAtIndex(dataKey, name, index)
        sendEvent('Groups', 'Random Names', null)
      })
    })
    .catch(error => {
      UI.message('Something went wrong')
      console.error(error)
      sendEvent('Error', 'Groups', 'Random Names: ' + error)
    })
}

export function onMyGroupsNamesRandom (context) {
  let selection = context.data.requestedCount

  if ((Settings.sessionVariable('RandomGroupsID') === undefined) || (Settings.sessionVariable('RandomGroupsType') === 'Text')) {
    getData('groups.get', {
      'user_id': USER_ID,
      'access_token': ACCESS_TOKEN,
      'v': API_VERSION
    })
      .then(response => {
        let arr = response['items']
        arr = shuffle(arr)

        let arrRand = []
        for (let i = 0; i < selection; i++) {
          arrRand.splice(i, 0, String(arr[i]))
        }

        GroupsNamesRandom(context, arrRand)
        UI.message('Now you can add avatars in Groups: Random')
        Settings.setSessionVariable('RandomGroupsID', arrRand)
        Settings.setSessionVariable('RandomGroupsType', 'Text')
      })
      .catch(error => {
        UI.message('Something went wrong')
        console.error(error)
        sendEvent('Error', 'Groups', 'Random Names 2: ' + error)
      })
  } else {
    let ids = Settings.sessionVariable('RandomGroupsID')
    GroupsNamesRandom(context, ids)
    Settings.setSessionVariable('RandomGroupsID', undefined)
  }
}

export function onBookmarksUsers (context) {
  let selection = context.data.requestedCount
  getData('fave.getPages', {
    'type': 'users',
    'access_token': ACCESS_TOKEN,
    'fields': 'photo_200,photo_100',
    'count': selection,
    'v': API_VERSION
  })
    .then(response => {
      let dataKey = context.data.key
      let items = util.toArray(context.data.items).map(sketch.fromNative)
      items.forEach((item, index) => {
        if (!item.type) item = sketch.Shape.fromNative(item.sketchObject)

        if (!isEmpty(response['items'][index]['user'].photo_200)) {
          process(response['items'][index]['user'].photo_200, dataKey, index, item)
        } else {
          process(response['items'][index]['user'].photo_100, dataKey, index, item)
        }

        sendEvent('Bookmarks', 'Users', null)
      })
    })
    .catch(error => {
      UI.message('Something went wrong')
      console.error(error)
      sendEvent('Error', 'Bookmarks', 'Users: ' + error)
    })
}

export function onBookmarksUsersNames (context) {
  let selection = context.data.requestedCount
  getData('fave.getPages', {
    'type': 'users',
    'access_token': ACCESS_TOKEN,
    'fields': 'photo_200,photo_100',
    'count': selection,
    'v': API_VERSION
  })
    .then(response => {
      let dataKey = context.data.key
      let items = util.toArray(context.data.items).map(sketch.fromNative)
      items.forEach((item, index) => {
        if (!item.type) item = sketch.Shape.fromNative(item.sketchObject)
        let fullName = response['items'][index]['user'].first_name + ' ' + response['items'][index]['user'].last_name
        DataSupplier.supplyDataAtIndex(dataKey, fullName, index)
        sendEvent('Bookmarks', 'Users Names', null)
      })
    })
    .catch(error => {
      UI.message('Something went wrong')
      console.error(error)
      sendEvent('Error', 'Bookmarks', 'Users Names: ' + error)
    })
}

export function onBookmarksGroups (context) {
  let selection = context.data.requestedCount
  getData('fave.getPages', {
    'type': 'groups',
    'access_token': ACCESS_TOKEN,
    'fields': 'photo_200,photo_100',
    'count': selection,
    'v': API_VERSION
  })
    .then(response => {
      let dataKey = context.data.key
      let items = util.toArray(context.data.items).map(sketch.fromNative)
      items.forEach((item, index) => {
        if (!item.type) item = sketch.Shape.fromNative(item.sketchObject)

        if (!isEmpty(response['items'][index]['group'].photo_200)) {
          process(response['items'][index]['group'].photo_200, dataKey, index, item)
        } else {
          process(response['items'][index]['group'].photo_100, dataKey, index, item)
        }

        sendEvent('Bookmarks', 'Groups', null)
      })
    })
    .catch(error => {
      UI.message('Something went wrong')
      console.error(error)
      sendEvent('Error', 'Bookmarks', 'Groups: ' + error)
    })
}

export function onBookmarksGroupsNames (context) {
  let selection = context.data.requestedCount
  getData('fave.getPages', {
    'type': 'groups',
    'access_token': ACCESS_TOKEN,
    'fields': 'photo_200,photo_100',
    'count': selection,
    'v': API_VERSION
  })
    .then(response => {
      let dataKey = context.data.key
      let items = util.toArray(context.data.items).map(sketch.fromNative)
      items.forEach((item, index) => {
        if (!item.type) item = sketch.Shape.fromNative(item.sketchObject)
        let fullName = response['items'][index]['group'].name
        DataSupplier.supplyDataAtIndex(dataKey, fullName, index)
        sendEvent('Bookmarks', 'Groups Names', null)
      })
    })
    .catch(error => {
      UI.message('Something went wrong')
      console.error(error)
      sendEvent('Error', 'Bookmarks', 'Groups Names: ' + error)
    })
}

function getData (method, options) {
  if (ACCESS_TOKEN === undefined || Settings.settingForKey('SCOPE_KEY') !== SCOPE) {
    auth()
  } else {
    return new Promise(function (resolve, reject) {
      let esc = encodeURIComponent
      let query = Object.keys(options)
        .map(key => esc(key) + '=' + esc(options[key]))
        .join('&')

      let url = API_URI + method + '?' + query
      fetch(url)
        .then(response => response.json())
        .then(json => {
          resolve(json.response)
          if (DEBUG_MODE) {
            console.log(url)
            console.log(USER_ID)
            console.log(ACCESS_TOKEN)
            console.log(Settings.settingForKey('SCOPE_KEY'))
            console.log(json.response)
          }
        })
        .catch(error => resolve(error))
    })
  }
}

function isEmpty (obj) {
  for (var key in obj) {
    return false
  }
  return true
}

function shuffle (array) {
  let currentIndex = array.length
  let temporaryValue,
    randomIndex

  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex)
    currentIndex -= 1

    temporaryValue = array[currentIndex]
    array[currentIndex] = array[randomIndex]
    array[randomIndex] = temporaryValue
  }

  return array
}

function process (data, dataKey, index, item) {
  return getImageFromURL(data).then(imagePath => {
    if (!imagePath) {
      UI.message('Something wrong happened')
      sendEvent('Error', 'Main', 'Process')
      return
    }
    DataSupplier.supplyDataAtIndex(dataKey, imagePath, index)

    if (item.type !== 'DataOverride') {
      Settings.setLayerSettingForKey(item, SETTING_KEY, data)
    }

    let downloadLocation = data
    return fetch(downloadLocation)
  })
}

function getImageFromURL (url) {
  return fetch(url)
    .then(res => res.blob())
    .then(saveTempFileFromImageData)
    .catch((err) => {
      console.error(err)
      return context.plugin.urlForResourceNamed('placeholder.png').path()
    })
}

function saveTempFileFromImageData (imageData) {
  const guid = NSProcessInfo.processInfo().globallyUniqueString()
  const imagePath = path.join(FOLDER, `${guid}.jpg`)
  try {
    fs.mkdirSync(FOLDER)
  } catch (err) {
    // probably because the folder already exists
    sendEvent('Error', 'Main', 'SaveTempFileFromImageData: ' + err)
  }
  try {
    fs.writeFileSync(imagePath, imageData, 'NSData')
    return imagePath
  } catch (err) {
    console.error(err)
    sendEvent('Error', 'Main', 'ImagePath: ' + err)
    return undefined
  }
}
