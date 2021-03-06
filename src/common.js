const sketch = require('sketch/dom')
const DataSupplier = require('sketch/data-supplier')
const UI = require('sketch/ui')
const Settings = require('sketch/settings')
const Async = require('sketch/async')

const os = require('os')
const path = require('path')
const util = require('util')
const fs = require('@skpm/fs')
const MochaJSDelegate = require('mocha-js-delegate')
const track = require('./analytics.js')

const APP_ID = '6742961'
const REDIRECT_URI = 'https://oauth.vk.com/blank.html'
const SCOPE = 'offline,friends,groups,video'
const API_URI = 'https://api.vk.com/method/'
const API_VERSION = '5.101'

const ACCESS_TOKEN = Settings.settingForKey('ACCESS_TOKEN')
const USER_ID = Settings.settingForKey('USER_ID')

const SETTING_KEY = 'vk.photo.id'
const FOLDER = path.join(os.tmpdir(), 'com.vk.data-plugin')

const DEBUG_MODE = false

function auth () {
  let authURL = 'https://oauth.vk.com/authorize?client_id=' + APP_ID + '&display=page&redirect_uri=' + REDIRECT_URI + '&scope=' + SCOPE + '&response_type=token&v=' + API_VERSION + '&revoke=1'
  let panelWidth = 800
  let panelHeight = 600

  let fiber = Async.createFiber()
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

export function checkauth () {
  (ACCESS_TOKEN === undefined || Settings.settingForKey('SCOPE_KEY') !== SCOPE) ? auth() : UI.message('You can use the plugin')
}

function sendEvent (category, action, value) {
  let analytics = track('UA-130190471-1', 'event', {
    ec: category, // the event category
    ea: action + ' ' + value // the event action
  }, { debug: DEBUG_MODE })
  return analytics
}

export function logout () {
  Settings.setSettingForKey('ACCESS_TOKEN', undefined)
  Settings.setSettingForKey('USER_ID', undefined)
  Settings.setSettingForKey('SCOPE_KEY', undefined)
  auth()
}

export function onStartup () {
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

export function onShutdown () {
  DataSupplier.deregisterDataSuppliers()
  try {
    if (fs.existsSync(FOLDER)) {
      fs.rmdirSync(FOLDER)
    }
  } catch (err) {
    console.error(err)
  }
}

export function onPhotoByUserID (context) {
  let recentTerm = Settings.sessionVariable('recentTermPhoto')
  let ownerId = (recentTerm === undefined || recentTerm.length === 0) ? USER_ID : recentTerm

  UI.getInputFromUser(
    'Enter Account ID of vk.com',
    { initialValue: ownerId },
    (error, value) => {
      if (error || value.length === 0) {
        // UI.message(error)
        // sendEvent('Error', 'User Input', error)
        // most likely the user canceled the input
      } else {
        ownerId = value.trim()
        Settings.setSessionVariable('recentTermPhoto', ownerId)

        let requestedCount = context.data.requestedCount
        getData('users.get', {
          'user_ids': ownerId,
          'fields': 'photo_200,photo_100',
          'access_token': ACCESS_TOKEN,
          'v': API_VERSION
        })
          .then(body => {
            let dataKey = context.data.key
            let items = util.toArray(context.data.items).map(sketch.fromNative)
            items.forEach((item, index) => {
              if (!item.type) {
                item = sketch.Shape.fromNative(item.sketchObject)
              }
              if (requestedCount > body.response.length) {
                let diff = requestedCount - body.response.length
                for (let i = 0; i < diff; i++) {
                  body.response.push(body.response[i])
                }
              }
              if (!isEmpty(body.response[index].photo_200)) {
                process(body.response[index].photo_200, dataKey, index, item)
              } else {
                process(body.response[index].photo_100, dataKey, index, item)
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
    }
  )
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
    .then(body => {
      let dataKey = context.data.key
      let items = util.toArray(context.data.items).map(sketch.fromNative)
      items.forEach((item, index) => {
        if (!item.type) {
          item = sketch.Shape.fromNative(item.sketchObject)
        }

        if (!isEmpty(body.response['items'][index].photo_200)) {
          process(body.response['items'][index].photo_200, dataKey, index, item)
        } else {
          process(body.response['items'][index].photo_100, dataKey, index, item)
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
    .then(body => {
      let dataKey = context.data.key
      let items = util.toArray(context.data.items).map(sketch.fromNative)
      items.forEach((item, index) => {
        if (!item.type) {
          item = sketch.Shape.fromNative(item.sketchObject)
        }

        if (!isEmpty(body.response['items'][index].photo_200)) {
          process(body.response['items'][index].photo_200, dataKey, index, item)
        } else {
          process(body.response['items'][index].photo_100, dataKey, index, item)
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
    .then(body => {
      let dataKey = context.data.key
      let items = util.toArray(context.data.items).map(sketch.fromNative)
      items.forEach((item, index) => {
        if (!item.type) {
          item = sketch.Shape.fromNative(item.sketchObject)
        }

        DataSupplier.supplyDataAtIndex(dataKey, body.response['items'][index].first_name, index)
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
    .then(body => {
      let dataKey = context.data.key
      let items = util.toArray(context.data.items).map(sketch.fromNative)
      items.forEach((item, index) => {
        if (!item.type) {
          item = sketch.Shape.fromNative(item.sketchObject)
        }
        DataSupplier.supplyDataAtIndex(dataKey, body.response['items'][index].last_name, index)

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
    .then(body => {
      let dataKey = context.data.key
      let items = util.toArray(context.data.items).map(sketch.fromNative)
      items.forEach((item, index) => {
        if (!item.type) {
          item = sketch.Shape.fromNative(item.sketchObject)
        }
        let fullName = body.response['items'][index].first_name + ' ' + body.response['items'][index].last_name
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
    .then(body => {
      let dataKey = context.data.key
      let items = util.toArray(context.data.items).map(sketch.fromNative)
      items.forEach((item, index) => {
        if (!item.type) {
          item = sketch.Shape.fromNative(item.sketchObject)
        }

        let fullName = body.response[0].first_name + ' ' + body.response[0].last_name
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
    .then(body => {
      let dataKey = context.data.key
      let items = util.toArray(context.data.items).map(sketch.fromNative)
      items.forEach((item, index) => {
        if (!item.type) {
          item = sketch.Shape.fromNative(item.sketchObject)
        }

        let name = body.response['items'][index].name
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
  let ownerId = (recentTerm === undefined || recentTerm.length === 0) ? USER_ID : recentTerm
  UI.getInputFromUser(
    'Enter Video Author ID of vk.com',
    { initialValue: ownerId },
    (error, value) => {
      if (error || value.length === 0) {
        // UI.message(error)
        // sendEvent('Error', 'User Input', error)
        // most likely the user canceled the input
      } else {
        ownerId = value
        Settings.setSessionVariable('recentTermVideo', ownerId)

        getData('video.get', {
          'owner_id': ownerId,
          'count': selection,
          'access_token': ACCESS_TOKEN,
          'v': API_VERSION
        })
          .then(body => {
            let dataKey = context.data.key
            let items = util.toArray(context.data.items).map(sketch.fromNative)
            items.forEach((item, index) => {
              if (!item.type) {
                item = sketch.Shape.fromNative(item.sketchObject)
              }
              
              let count = Object.keys(body.response['items'][index].image).length
              count = count - 1
              process(body.response['items'][index].image[count].url, dataKey, index, item)
      
              sendEvent('Video', 'Thumbnails', null)
            })
          })
          .catch(error => {
            UI.message('Something went wrong')
            console.error(error)
            sendEvent('Error', 'Video', 'Thumbnails: ' + error)
          })
      }
    }
  )
}

export function onVideoTitleByOwnerID (context) {
  let selection = context.data.requestedCount
  let recentTerm = Settings.sessionVariable('recentTermVideo')
  let ownerId = (recentTerm === undefined || recentTerm.length === 0) ? USER_ID : recentTerm
  UI.getInputFromUser(
    'Enter Video Author ID of vk.com',
    { initialValue: ownerId },
    (error, value) => {
      if (error || value.length === 0) {
        // UI.message(error)
        // sendEvent('Error', 'User Input', error)
        // most likely the user canceled the input
      } else {
        ownerId = value
        Settings.setSessionVariable('recentTermVideo', ownerId)

        getData('video.get', {
          'owner_id': ownerId,
          'count': selection,
          'access_token': ACCESS_TOKEN,
          'v': API_VERSION
        })
          .then(body => {
            let dataKey = context.data.key
            let items = util.toArray(context.data.items).map(sketch.fromNative)
            items.forEach((item, index) => {
              if (!item.type) {
                item = sketch.Shape.fromNative(item.sketchObject)
              }
      
              if (selection > body.response['items'].length) {
                let diff = selection - body.response['items'].length
                for (let i = 0; i < diff; i++) {
                  body.response['items'].push(body.response['items'][i])
                }
              }
      
              let name = body.response['items'][index].title
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
    }
  )
}

export function onVideoViewsByOwnerID (context) {
  let selection = context.data.requestedCount
  let recentTerm = Settings.sessionVariable('recentTermVideo')
  let ownerId = (recentTerm === undefined || recentTerm.length === 0) ? USER_ID : recentTerm
  UI.getInputFromUser(
    'Enter Video Author ID of vk.com',
    { initialValue: ownerId },
    (error, value) => {
      if (error || value.length === 0) {
        // UI.message(error)
        // sendEvent('Error', 'User Input', error)
        // most likely the user canceled the input
      } else {
        ownerId = value
        Settings.setSessionVariable('recentTermVideo', ownerId)

        getData('video.get', {
          'owner_id': ownerId,
          'count': selection,
          'access_token': ACCESS_TOKEN,
          'v': API_VERSION
        })
          .then(body => {
            let dataKey = context.data.key
            let items = util.toArray(context.data.items).map(sketch.fromNative)
            items.forEach((item, index) => {
              if (!item.type) {
                item = sketch.Shape.fromNative(item.sketchObject)
              }
      
              let views = body.response['items'][index].views
              views = views + ' ' + getNoun(views, 'просмотр', 'просмотра', 'просмотров')
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
    }
  )
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
      .then(body => {
        let dataKey = context.data.key
        let items = util.toArray(context.data.items).map(sketch.fromNative)

        let arr = []
        for (let i = 0; i < selection; i++) {
          arr.splice(i, 0, String(body.response['items'][i].id))
        }
        Settings.setSessionVariable('RandomID', arr)
        Settings.setSessionVariable('RandomType', 'Image')
        items.forEach((item, index) => {
          if (!item.type) {
            item = sketch.Shape.fromNative(item.sketchObject)
          }

          if (!isEmpty(body.response['items'][index].photo_200)) {
            process(body.response['items'][index].photo_200, dataKey, index, item)
          } else {
            process(body.response['items'][index].photo_100, dataKey, index, item)
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
      .then(body => {
        let dataKey = context.data.key
        let items = util.toArray(context.data.items).map(sketch.fromNative)
        items.forEach((item, index) => {
          if (!item.type) {
            item = sketch.Shape.fromNative(item.sketchObject)
          }

          if (!isEmpty(body.response[index].photo_200) !== 0) {
            process(body.response[index].photo_200, dataKey, index, item)
          } else {
            process(body.response[index].photo_100, dataKey, index, item)
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
      .then(body => {
        let dataKey = context.data.key
        let items = util.toArray(context.data.items).map(sketch.fromNative)

        let arr = []
        for (let i = 0; i < selection; i++) {
          arr.splice(i, 0, String(body.response['items'][i].id))
        }
        Settings.setSessionVariable('RandomID', arr)
        Settings.setSessionVariable('RandomType', 'Text')

        items.forEach((item, index) => {
          if (!item.type) {
            item = sketch.Shape.fromNative(item.sketchObject)
          }

          let fullName = body.response['items'][index].first_name + ' ' + body.response['items'][index].last_name
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
      .then(body => {
        let dataKey = context.data.key
        let items = util.toArray(context.data.items).map(sketch.fromNative)
        items.forEach((item, index) => {
          if (!item.type) {
            item = sketch.Shape.fromNative(item.sketchObject)
          }

          let fullName = body.response[index].first_name + ' ' + body.response[index].last_name
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
    .then(body => {
      let dataKey = context.data.key
      let items = util.toArray(context.data.items).map(sketch.fromNative)

      items.forEach((item, index) => {
        if (!item.type) {
          item = sketch.Shape.fromNative(item.sketchObject)
        }

        if (!isEmpty(body.response[index].photo_200)) {
          process(body.response[index].photo_200, dataKey, index, item)
        } else {
          process(body.response[index].photo_100, dataKey, index, item)
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
      .then(body => {
        let arr = body.response['items']
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
    .then(body => {
      let dataKey = context.data.key
      let items = util.toArray(context.data.items).map(sketch.fromNative)

      items.forEach((item, index) => {
        if (!item.type) {
          item = sketch.Shape.fromNative(item.sketchObject)
        }

        let name = body.response[index].name
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
      .then(body => {
        let arr = body.response['items']
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
    .then(body => {
      let dataKey = context.data.key
      let items = util.toArray(context.data.items).map(sketch.fromNative)
      items.forEach((item, index) => {
        if (!item.type) item = sketch.Shape.fromNative(item.sketchObject)

        if (!isEmpty(body.response['items'][index]['user'].photo_200)) {
          process(body.response['items'][index]['user'].photo_200, dataKey, index, item)
        } else {
          process(body.response['items'][index]['user'].photo_100, dataKey, index, item)
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
    .then(body => {
      let dataKey = context.data.key
      let items = util.toArray(context.data.items).map(sketch.fromNative)
      items.forEach((item, index) => {
        if (!item.type) item = sketch.Shape.fromNative(item.sketchObject)
        let fullName = body.response['items'][index]['user'].first_name + ' ' + body.response['items'][index]['user'].last_name
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
    .then(body => {
      let dataKey = context.data.key
      let items = util.toArray(context.data.items).map(sketch.fromNative)
      items.forEach((item, index) => {
        if (!item.type) item = sketch.Shape.fromNative(item.sketchObject)

        if (!isEmpty(body.response['items'][index]['group'].photo_200)) {
          process(body.response['items'][index]['group'].photo_200, dataKey, index, item)
        } else {
          process(body.response['items'][index]['group'].photo_100, dataKey, index, item)
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
    .then(body => {
      let dataKey = context.data.key
      let items = util.toArray(context.data.items).map(sketch.fromNative)
      items.forEach((item, index) => {
        if (!item.type) item = sketch.Shape.fromNative(item.sketchObject)
        let fullName = body.response['items'][index]['group'].name
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

export function getData (method, options) {
  let esc = encodeURIComponent
	let query = Object.keys(options)
		.map(key => esc(key) + '=' + esc(options[key]))
		.join('&')

	let url = API_URI + method + '?' + query

  if (ACCESS_TOKEN === undefined || Settings.settingForKey('SCOPE_KEY') !== SCOPE) {
    auth()
  } else {
    return new Promise(function (resolve, reject) {
      fetch(url)
      .then(response => response.json())
      .then(body => {
        if(DEBUG_MODE) {
          console.log(url)
          console.log(USER_ID)
          console.log(ACCESS_TOKEN)
          console.log(Settings.settingForKey('SCOPE_KEY'))
          console.log(body)
        }
        
        if(body.error) {
          if(body.error.error_code === 5) logout()
          sendEvent('Error', 'API_ERROR', body.error.error_msg)
          UI.message(body.error.error_msg)
        }
        resolve(body)
      })
      .catch(e => {
        if(DEBUG_MODE) console.error(e)
        sendEvent('Error', 'getData', e)
        resolve(e)
      })
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
      sendEvent('Error', 'Main', 'getImageFromURL: ' + err)
      return context.plugin.urlForResourceNamed('placeholder.png').path()
    })
}

function saveTempFileFromImageData (imageData) {
  const guid = NSProcessInfo.processInfo().globallyUniqueString()
  const imagePath = path.join(FOLDER, `${guid}.jpg`)

  try {
    if (!fs.existsSync(FOLDER)){
      fs.mkdirSync(FOLDER);
    }
  } catch (error) {
    if(DEBUG_MODE) console.error(error)
    sendEvent('Error', 'Main', 'SaveTempFileFromImageData: ' + error)
  }

  try {
    fs.writeFileSync(imagePath, imageData, 'NSData')
    return imagePath
  } catch (error) {
    if(DEBUG_MODE) console.error(error)
    sendEvent('Error', 'Main', 'ImagePath: ' + error)
    return undefined
  }
}

function getNoun(number, one, two, five) {
  let n = Math.abs(number);
  n %= 100;
  if (n >= 5 && n <= 20) return five;

  n %= 10;
  if (n === 1) return one

  if (n >= 2 && n <= 4) return two;

  return five;
}