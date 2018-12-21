const sketch = require('sketch')
const util = require('util')
const os = require('os')
const path = require('path')
const fs = require('@skpm/fs')
const MochaJSDelegate = require('mocha-js-delegate')
const {
  sendEvent,
  sendError
} = require('./analytics.js')

const {
  DataSupplier,
  UI,
  Settings
} = sketch

const APP_ID = '6742961'
const REDIRECT_URI = 'https://oauth.vk.com/blank.html'
const SCOPE = 'offline,friends,groups,video'
const API_URI = 'https://api.vk.com/method/'
const API_VERSION = '5.92'

const SETTING_KEY = 'vk.photo.id'
const FOLDER = path.join(os.tmpdir(), 'com.vk.data-plugin')

const ACCESS_TOKEN = Settings.settingForKey('ACCESS_TOKEN')
const USER_ID = Settings.settingForKey('USER_ID')

const isDEV = false

export function checkauth() {
  if (Settings.settingForKey('ACCESS_TOKEN') == undefined || Settings.settingForKey('SCOPE_KEY') !== SCOPE || isDEV == true) {
    auth()
  } else {
    UI.message('You can use the plugin')
  }
}

function auth() {
  let URL = `https://oauth.vk.com/authorize?client_id=${APP_ID}&display=page&redirect_uri=${REDIRECT_URI}&scope=${SCOPE}&response_type=token&v=${API_VERSION}`
  let request = NSURLRequest.requestWithURL(NSURL.URLWithString(URL))

  let script = COScript.currentCOScript()
  script.setShouldKeepAround_(true)
  let frame = NSMakeRect(0, 0, 800, 600)

  let cfg = WKWebViewConfiguration.alloc().init()
  cfg.setWebsiteDataStore(WKWebsiteDataStore.nonPersistentDataStore())
  let webView = WKWebView.alloc().initWithFrame_configuration(frame, cfg)
  let mask = NSTitledWindowMask + NSClosableWindowMask
  let panel = NSPanel.alloc().initWithContentRect_styleMask_backing_defer(frame, mask, NSBackingStoreBuffered, true)
  let delegate = new MochaJSDelegate({
    'webView:didCommitNavigation:': function(webView) {
      let components = NSURLComponents.componentsWithURL_resolvingAgainstBaseURL(webView.URL(), false)
      if (components.path() == "/blank.html") {
        let fragment = components.fragment()
        let url = NSURL.URLWithString("https://vk.com/?" + String(fragment))
        let queryItems = NSURLComponents.componentsWithURL_resolvingAgainstBaseURL(url, false).queryItems()

        let values = queryItems.reduce(function(prev, item) {
          prev[String(item.name())] = String(item.value())
          return prev
        }, {})

        let token = values["access_token"]
        let user_id = values["user_id"]

        if (token !== undefined && user_id !== undefined) {

          Settings.setSettingForKey('ACCESS_TOKEN', token)
          Settings.setSettingForKey('USER_ID', user_id)
          Settings.setSettingForKey('SCOPE_KEY', SCOPE)

          UI.message('Success')
          panel.close()
          script.setShouldKeepAround_(false)
        }
      }
    },
  })

  webView.setNavigationDelegate(delegate.getClassInstance())
  webView.loadRequest(request)
  panel.contentView().addSubview(webView)
  panel.makeKeyAndOrderFront(null)
  panel.center()
}

export function logout() {
  Settings.setSettingForKey('ACCESS_TOKEN', undefined)
  Settings.setSettingForKey('USER_ID', undefined)
  Settings.setSettingForKey('SCOPE_KEY', undefined)
  auth()
}

export function onStartup(context) {
  //image
  DataSupplier.registerDataSupplier('public.image', 'Your Avatar', 'MyPhoto')
  DataSupplier.registerDataSupplier('public.image', 'Avatar by..', 'PhotoByUserID')
  DataSupplier.registerDataSupplier('public.image', 'Friends: Hints', 'MyFriends')
  DataSupplier.registerDataSupplier('public.image', 'Friends: Random', 'MyFriendsRandom')
  DataSupplier.registerDataSupplier('public.image', 'Groups: Hints', 'MyGroups')
  DataSupplier.registerDataSupplier('public.image', 'Groups: Random', 'MyGroupsRandom')
  DataSupplier.registerDataSupplier('public.image', 'Video by..', 'VideoByOwnerID')

  //text
  DataSupplier.registerDataSupplier('public.text', 'Your Name', 'MyName')
  DataSupplier.registerDataSupplier('public.text', 'Friends: First Name', 'MyFriendsFirstNames')
  DataSupplier.registerDataSupplier('public.text', 'Friends: Full Name', 'MyFriendsFullNames')
  DataSupplier.registerDataSupplier('public.text', 'Friends: Random', 'MyFriendsNamesRandom')
  DataSupplier.registerDataSupplier('public.text', 'Groups: Hints', 'MyGroupsNames')
  DataSupplier.registerDataSupplier('public.text', 'Groups: Random', 'MyGroupsNamesRandom')
  DataSupplier.registerDataSupplier('public.text', 'Video Title by..', 'VideoTitleByOwnerID')
  DataSupplier.registerDataSupplier('public.text', 'Video Views by..', 'VideoViewsByOwnerID')

  if (ACCESS_TOKEN !== undefined) {
    getData('stats.trackVisitor', {
      'access_token': ACCESS_TOKEN,
      'v': API_VERSION
    })
  }
  sendEvent(context, 'Launch Sketch', 'Hooray')
}

export function onShutdown() {
  Settings.setSettingForKey('RandomID', undefined)
  Settings.setSettingForKey('RandomGroupsID', undefined)
  DataSupplier.deregisterDataSuppliers()
  try {
    fs.rmdirSync(FOLDER)
  } catch (err) {
    console.error(err)
  }
}

export function onMyPhoto(context) {
  getData('users.get', {
      'user_ids': USER_ID,
      'fields': 'photo_200,photo_100',
      'access_token': ACCESS_TOKEN,
      'v': API_VERSION
    })
    .then(response => {
      let dataKey = context.data.key
      const items = util.toArray(context.data.items).map(sketch.fromNative)
      items.forEach((item, index) => {
        let layer
        if (!item.type) {
          item = sketch.Shape.fromNative(item.sketchObject)
        }
        if (item.type === 'DataOverride') {
          layer = item.symbolInstance
        } else {
          layer = item
        }

        if (response[index].photo_200 == undefined) {
          process(response[index].photo_100, dataKey, index, item)
        } else {
          process(response[index].photo_200, dataKey, index, item)
        }

        sendEvent(context, 'User', 'My Avatar')
      })
    })
    .catch(error => {
      UI.message('Something went wrong')
      console.error(error)
      sendEvent(context, 'Error', error)
    })
}

export function onPhotoByUserID(context) {
  let owner_id = UI.getStringFromUser('Введите ID нужных людей..', USER_ID).replace(' ', '-').toLowerCase()
  if (owner_id != 'null') {
    getData('users.get', {
        'user_ids': owner_id,
        'fields': 'photo_200,photo_100',
        'access_token': ACCESS_TOKEN,
        'v': API_VERSION
      })
      .then(response => {
        let dataKey = context.data.key
        const items = util.toArray(context.data.items).map(sketch.fromNative)
        items.forEach((item, index) => {
          let layer
          if (!item.type) {
            item = sketch.Shape.fromNative(item.sketchObject)
          }
          if (item.type === 'DataOverride') {
            layer = item.symbolInstance
          } else {
            layer = item
          }

          if (response[index].photo_200 == undefined) {
            process(response[index].photo_100, dataKey, index, item)
          } else {
            process(response[index].photo_200, dataKey, index, item)
          }

          sendEvent(context, 'Friends', 'By User ID')
        })
      })
      .catch(error => {
        UI.message('Something went wrong')
        console.error(error)
        sendEvent(context, 'Error', error)
      })
  }
}

export function onMyFriends(context) {
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
      const items = util.toArray(context.data.items).map(sketch.fromNative)
      items.forEach((item, index) => {
        let layer
        if (!item.type) {
          item = sketch.Shape.fromNative(item.sketchObject)
        }
        if (item.type === 'DataOverride') {
          layer = item.symbolInstance
        } else {
          layer = item
        }

        if (response['items'][index].photo_200 == undefined) {
          process(response['items'][index].photo_100, dataKey, index, item)
        } else {
          process(response['items'][index].photo_200, dataKey, index, item)
        }

        sendEvent(context, 'Friends', 'Hints')
      })
    })
    .catch(error => {
      UI.message('Something went wrong')
      console.error(error)
      sendEvent(context, 'Error', error)
    })
}

export function onMyGroups(context) {
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
      const items = util.toArray(context.data.items).map(sketch.fromNative)
      items.forEach((item, index) => {
        let layer
        if (!item.type) {
          item = sketch.Shape.fromNative(item.sketchObject)
        }
        if (item.type === 'DataOverride') {
          layer = item.symbolInstance
        } else {
          layer = item
        }

        if (response['items'][index].photo_200 == undefined) {
          process(response['items'][index].photo_100, dataKey, index, item)
        } else {
          process(response['items'][index].photo_200, dataKey, index, item)
        }

        sendEvent(context, 'Groups', 'Avatar')
      })
    })
    .catch(error => {
      UI.message('Something went wrong')
      console.error(error)
      sendEvent(context, 'Error', error)
    })
}

export function onMyFriendsFirstNames(context) {
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
      const items = util.toArray(context.data.items).map(sketch.fromNative)
      items.forEach((item, index) => {
        let layer
        if (!item.type) {
          item = sketch.Shape.fromNative(item.sketchObject)
        }
        if (item.type === 'DataOverride') {
          layer = item.symbolInstance
        } else {
          layer = item
        }
        DataSupplier.supplyDataAtIndex(dataKey, response['items'][index].first_name, index)

        sendEvent(context, 'Friends', 'First Names')
      })
    })
    .catch(error => {
      UI.message('Something went wrong')
      console.error(error)
      sendEvent(context, 'Error', error)
    })
}

export function onMyFriendsFullNames(context) {
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
      const items = util.toArray(context.data.items).map(sketch.fromNative)
      items.forEach((item, index) => {
        let layer
        if (!item.type) {
          item = sketch.Shape.fromNative(item.sketchObject)
        }
        if (item.type === 'DataOverride') {
          layer = item.symbolInstance
        } else {
          layer = item
        }
        let full_name = response['items'][index].first_name + ' ' + response['items'][index].last_name
        DataSupplier.supplyDataAtIndex(dataKey, full_name, index)

        sendEvent(context, 'Friends', 'Full Names')
      })
    })
    .catch(error => {
      UI.message('Something went wrong')
      console.error(error)
      sendEvent(context, 'Error', error)
    })
}

export function onMyName(context) {
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
        let layer

        if (!item.type) {
          item = sketch.Shape.fromNative(item.sketchObject)
        }

        if (item.type === 'DataOverride') {
          layer = item.symbolInstance
        } else {
          layer = item
        }

        let full_name = response[index].first_name + ' ' + response[index].last_name
        DataSupplier.supplyDataAtIndex(dataKey, full_name, index)

        sendEvent(context, 'User', 'Names')
      })
    })
    .catch(function(error) {
      UI.message('Something went wrong')
      console.error(error)
      sendEvent(context, 'Error', error)
    })
}

export function onMyGroupsNames(context) {
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
        let layer

        if (!item.type) {
          item = sketch.Shape.fromNative(item.sketchObject)
        }

        if (item.type === 'DataOverride') {
          layer = item.symbolInstance
        } else {
          layer = item
        }

        let name = response['items'][index].name
        DataSupplier.supplyDataAtIndex(dataKey, name, index)

        sendEvent(context, 'Groups', 'Names')
      })
    })
    .catch(error => {
      UI.message('Something went wrong')
      console.error(error)
      sendEvent(context, 'Error', error)
    })
}

export function onVideoByOwnerID(context) {
  let selection = context.data.requestedCount
  let owner_id = UI.getStringFromUser('Введите ID автора видео..', USER_ID).replace(' ', '-').toLowerCase()
  if (owner_id != 'null') {
    getData('video.get', {
        'owner_id': owner_id,
        'count': selection,
        'access_token': ACCESS_TOKEN,
        'v': API_VERSION
      })
      .then(response => {
        let dataKey = context.data.key
        const items = util.toArray(context.data.items).map(sketch.fromNative)
        items.forEach((item, index) => {
          let layer
          if (!item.type) {
            item = sketch.Shape.fromNative(item.sketchObject)
          }
          if (item.type === 'DataOverride') {
            layer = item.symbolInstance
          } else {
            layer = item
          }

          if (response['items'][index].photo_1280 !== undefined) {
            process(response['items'][index].photo_1280, dataKey, index, item)
          } else if (response['items'][index].photo_800 !== undefined) {
            process(response['items'][index].photo_800, dataKey, index, item)
          } else if (response['items'][index].photo_640 !== undefined) {
            process(response['items'][index].photo_640, dataKey, index, item)
          } else if (response['items'][index].photo_320 !== undefined) {
            process(response['items'][index].photo_320, dataKey, index, item)
          } else {
            process(response['items'][index].photo_130, dataKey, index, item)
          }

          sendEvent(context, 'Video', 'Thumbnails')
        })
      })
      .catch(error => {
        UI.message('Something went wrong')
        console.error(error)
        sendEvent(context, 'Error', error)
      })
  }
}

export function onVideoTitleByOwnerID(context) {
  let selection = context.data.requestedCount
  let owner_id = UI.getStringFromUser('Введите ID автора видео..', USER_ID).replace(' ', '-').toLowerCase()
  if (owner_id != 'null') {
    getData('video.get', {
        'owner_id': owner_id,
        'count': selection,
        'access_token': ACCESS_TOKEN,
        'v': API_VERSION
      })
      .then(response => {
        let dataKey = context.data.key
        const items = util.toArray(context.data.items).map(sketch.fromNative)
        items.forEach((item, index) => {
          let layer
          if (!item.type) {
            item = sketch.Shape.fromNative(item.sketchObject)
          }
          if (item.type === 'DataOverride') {
            layer = item.symbolInstance
          } else {
            layer = item
          }
          let name = response['items'][index].title
          DataSupplier.supplyDataAtIndex(dataKey, name, index)

          sendEvent(context, 'Video', 'Title')
        })
      })
      .catch(error => {
        UI.message('Something went wrong')
        console.error(error)
        sendEvent(context, 'Error', error)
      })
  }
}

export function onVideoViewsByOwnerID(context) {
  let selection = context.data.requestedCount
  let owner_id = UI.getStringFromUser('Введите ID автора видео..', USER_ID).replace(' ', '-').toLowerCase()
  if (owner_id != 'null') {
    getData('video.get', {
        'owner_id': owner_id,
        'count': selection,
        'access_token': ACCESS_TOKEN,
        'v': API_VERSION
      })
      .then(response => {
        let dataKey = context.data.key
        const items = util.toArray(context.data.items).map(sketch.fromNative)
        items.forEach((item, index) => {
          let layer
          if (!item.type) {
            item = sketch.Shape.fromNative(item.sketchObject)
          }
          if (item.type === 'DataOverride') {
            layer = item.symbolInstance
          } else {
            layer = item
          }
          let views = response['items'][index].views
          views = views + ' просмотров'
          DataSupplier.supplyDataAtIndex(dataKey, views, index)

          sendEvent(context, 'Video', 'Views')
        })
      })
      .catch(error => {
        UI.message('Something went wrong')
        console.error(error)
        sendEvent(context, 'Error', error)
      })
  }
}

export function onMyFriendsRandom(context) {
  let selection = context.data.requestedCount

  if (Settings.settingForKey('RandomID') == undefined) {
    //console.log('NoCookie' + context)
    //console.log('1:'+ Settings.settingForKey('RandomID'))
    getData('friends.get', {
        'user_id': USER_ID,
        'order': 'random',
        'fields': 'photo_200,photo_100',
        'access_token': ACCESS_TOKEN,
        'count': selection,
        'v': API_VERSION
      })
      .then(response => {
        //console.log(String(JSON.stringify(response)))
        let dataKey = context.data.key
        const items = util.toArray(context.data.items).map(sketch.fromNative)

        let arr = []
        for (let i = 0; i < selection; i++) {
          arr.splice(i, 0, String(response['items'][i].id))
        }
        Settings.setSettingForKey('RandomID', arr)
        //console.log('2:'+ Settings.settingForKey('RandomID'))
        items.forEach((item, index) => {
          let layer
          if (!item.type) {
            item = sketch.Shape.fromNative(item.sketchObject)
          }
          if (item.type === 'DataOverride') {
            layer = item.symbolInstance
          } else {
            layer = item
          }

          if (response['items'][index].photo_200 == undefined) {
            process(response['items'][index].photo_100, dataKey, index, item)
          } else {
            process(response['items'][index].photo_200, dataKey, index, item)
          }
          UI.message('Now you can add names in Friends: Random')

          sendEvent(context, 'Friends', 'Random')
        })
      })
      .catch(error => {
        UI.message('Something went wrong')
        console.error(error)
        sendEvent(context, 'Error', error)
      })
  } else {
    //console.log('Cookie' + context)
    //console.log('3:'+ Settings.settingForKey('RandomID'))
    let userids = Settings.settingForKey('RandomID').join(',')
    getData('users.get', {
        'user_ids': userids,
        'fields': 'photo_200,photo_100',
        'access_token': ACCESS_TOKEN,
        'v': API_VERSION
      })
      .then(response => {
        //console.log(String(JSON.stringify(response)))
        let dataKey = context.data.key
        const items = util.toArray(context.data.items).map(sketch.fromNative)
        items.forEach((item, index) => {
          let layer
          if (!item.type) {
            item = sketch.Shape.fromNative(item.sketchObject)
          }
          if (item.type === 'DataOverride') {
            layer = item.symbolInstance
          } else {
            layer = item
          }

          if (response[index].photo_200 == undefined) {
            process(response[index].photo_100, dataKey, index, item)
          } else {
            process(response[index].photo_200, dataKey, index, item)
          }

          sendEvent(context, 'Friends', 'Random')
        })
      })
      .catch(error => {
        UI.message('Something went wrong')
        console.error(error)
        sendEvent(context, 'Error', error)
      })
    Settings.setSettingForKey('RandomID', undefined)
  }
}

export function onMyFriendsNamesRandom(context) {
  let selection = context.data.requestedCount

  if (Settings.settingForKey('RandomID') == undefined) {
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
        const items = util.toArray(context.data.items).map(sketch.fromNative)

        let arr = []
        for (let i = 0; i < selection; i++) {
          arr.splice(i, 0, String(response['items'][i].id))
        }
        Settings.setSettingForKey('RandomID', arr)

        items.forEach((item, index) => {
          let layer
          if (!item.type) {
            item = sketch.Shape.fromNative(item.sketchObject)
          }
          if (item.type === 'DataOverride') {
            layer = item.symbolInstance
          } else {
            layer = item
          }

          let full_name = response['items'][index].first_name + ' ' + response['items'][index].last_name
          DataSupplier.supplyDataAtIndex(dataKey, full_name, index)
          UI.message('Now you can add avatars in Friends: Random')

          sendEvent(context, 'Friends', 'Random Names')
        })
      })
      .catch(error => {
        UI.message('Something went wrong')
        console.error(error)
        sendEvent(context, 'Error', error)
      })
  } else {
    let userids = Settings.settingForKey('RandomID').join(',')
    getData('users.get', {
        'user_ids': userids,
        'fields': 'first_name,last_name',
        'access_token': ACCESS_TOKEN,
        'v': API_VERSION
      })
      .then(response => {
        let dataKey = context.data.key
        const items = util.toArray(context.data.items).map(sketch.fromNative)
        items.forEach((item, index) => {
          let layer
          if (!item.type) {
            item = sketch.Shape.fromNative(item.sketchObject)
          }
          if (item.type === 'DataOverride') {
            layer = item.symbolInstance
          } else {
            layer = item
          }
          let full_name = response[index].first_name + ' ' + response[index].last_name
          DataSupplier.supplyDataAtIndex(dataKey, full_name, index)
        })

        sendEvent(context, 'Friends', 'Random Names')
      })
      .catch(error => {
        UI.message('Something went wrong')
        console.error(error)
        sendEvent(context, 'Error', error)
      })
    Settings.setSettingForKey('RandomID', undefined)
  }
}

function GroupsRandom(context, array) {
  getData('groups.getById', {
      'group_ids': array,
      'access_token': ACCESS_TOKEN,
      'v': API_VERSION
    })
    .then(response => {
      let dataKey = context.data.key
      const items = util.toArray(context.data.items).map(sketch.fromNative)

      items.forEach((item, index) => {
        let layer
        if (!item.type) {
          item = sketch.Shape.fromNative(item.sketchObject)
        }
        if (item.type === 'DataOverride') {
          layer = item.symbolInstance
        } else {
          layer = item
        }

        if (response[index].photo_200 == undefined) {
          process(response[index].photo_100, dataKey, index, item)
        } else {
          process(response[index].photo_200, dataKey, index, item)
        }
        UI.message('Now you can add names in Groups: Random')
        sendEvent(context, 'Groups', 'Random')
      })
    })
    .catch(error => {
      UI.message('Something went wrong')
      console.error(error)
      sendEvent(context, 'Error', error)
    })
}

export function onMyGroupsRandom(context) {
  let selection = context.data.requestedCount

  if (Settings.settingForKey('RandomGroupsID') == undefined) {
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
        Settings.setSettingForKey('RandomGroupsID', arrRand)
      })
      .catch(error => {
        UI.message('Something went wrong')
        console.error(error)
        sendEvent(context, 'Error', error)
      })
  } else {
    let ids = Settings.settingForKey('RandomGroupsID')
    GroupsRandom(context, ids)
    Settings.setSettingForKey('RandomGroupsID', undefined)
  }
}

function GroupsNamesRandom(context, array) {
  getData('groups.getById', {
      'group_ids': array,
      'access_token': ACCESS_TOKEN,
      'v': API_VERSION
    })
    .then(response => {
      let dataKey = context.data.key
      const items = util.toArray(context.data.items).map(sketch.fromNative)

      items.forEach((item, index) => {
        let layer
        if (!item.type) {
          item = sketch.Shape.fromNative(item.sketchObject)
        }
        if (item.type === 'DataOverride') {
          layer = item.symbolInstance
        } else {
          layer = item
        }

        let name = response[index].name
        DataSupplier.supplyDataAtIndex(dataKey, name, index)
        UI.message('Now you can add avatars in Groups: Random')
        sendEvent(context, 'Groups', 'Random Names')
      })
    })
    .catch(error => {
      UI.message('Something went wrong')
      console.error(error)
      sendEvent(context, 'Error', error)
    })
}

export function onMyGroupsNamesRandom(context) {
  let selection = context.data.requestedCount

  if (Settings.settingForKey('RandomGroupsID') == undefined) {
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
        Settings.setSettingForKey('RandomGroupsID', arrRand)
      })
      .catch(error => {
        UI.message('Something went wrong')
        console.error(error)
        sendEvent(context, 'Error', error)
      })
  } else {
    let ids = Settings.settingForKey('RandomGroupsID')
    GroupsNamesRandom(context, ids)
    Settings.setSettingForKey('RandomGroupsID', undefined)
  }
}

function getData(method, options) {
  if (Settings.settingForKey('ACCESS_TOKEN') == undefined || Settings.settingForKey('SCOPE_KEY') !== SCOPE || isDEV == true) {
    auth()
  } else {
    return new Promise(function(resolve, reject) {
      let esc = encodeURIComponent
      let query = Object.keys(options)
        .map(key => esc(key) + '=' + esc(options[key]))
        .join('&')

      let url = API_URI + method + '?' + query
      fetch(url)
        .then(response => response.json())
        .then(json => resolve(json.response))
        .catch(error => resolve(error))
    })
  }
}

function shuffle(array) {
  let currentIndex = array.length,
    temporaryValue, randomIndex

  while (0 !== currentIndex) {
    randomIndex = Math.floor(Math.random() * currentIndex)
    currentIndex -= 1

    temporaryValue = array[currentIndex]
    array[currentIndex] = array[randomIndex]
    array[randomIndex] = temporaryValue
  }

  return array
}

function process(data, dataKey, index, item) {
  console.log(String(data))
  return getImageFromURL(data).then(imagePath => {
    if (!imagePath) {
      return
    }
    DataSupplier.supplyDataAtIndex(dataKey, imagePath, index)

    if (item.type != 'DataOverride') {
      Settings.setLayerSettingForKey(item, SETTING_KEY, data)
    }

    let downloadLocation = data
    return fetch(downloadLocation)
  })
}

function getImageFromURL(url) {
  return fetch(url)
    .then(res => res.blob())
    .then(saveTempFileFromImageData)
    .catch((err) => {
      console.error(err)
      return context.plugin.urlForResourceNamed('placeholder.png').path()
    })
}

function saveTempFileFromImageData(imageData) {
  const guid = NSProcessInfo.processInfo().globallyUniqueString()
  const imagePath = path.join(FOLDER, `${guid}.jpg`)
  try {
    fs.mkdirSync(FOLDER)
  } catch (err) {
    // probably because the folder already exists
  }
  try {
    fs.writeFileSync(imagePath, imageData, 'NSData')
    return imagePath
  } catch (err) {
    console.error(err)
    return undefined
  }
}