const sketch = require('sketch')
const util = require('util')
const os = require('os')
const path = require('path')
const fs = require('@skpm/fs')
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
const API_VERSION = '5.90'

const SETTING_KEY = 'vk.photo.id'
const FOLDER = path.join(os.tmpdir(), 'com.vk.data-plugin')

const ACCESS_TOKEN = Settings.settingForKey('ACCESS_TOKEN')
const USER_ID = Settings.settingForKey('USER_ID')

const isDEV = false

export default function() {
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

export function onStartup() {
  //image
  DataSupplier.registerDataSupplier('public.image', 'Your Avatar', 'MyPhoto')
  DataSupplier.registerDataSupplier('public.image', 'Avatar by..', 'PhotoByUserID')
  DataSupplier.registerDataSupplier('public.image', 'Friends: Hints', 'MyFriends')
  DataSupplier.registerDataSupplier('public.image', 'Friends: Random', 'MyFriendsRandom')
  DataSupplier.registerDataSupplier('public.image', 'Groups', 'MyGroups')
  DataSupplier.registerDataSupplier('public.image', 'Video by..', 'VideoByOwnerID')

  //text
  DataSupplier.registerDataSupplier('public.text', 'Your Name', 'MyName')
  DataSupplier.registerDataSupplier('public.text', 'Friends: First Name', 'MyFriendsFirstNames')
  DataSupplier.registerDataSupplier('public.text', 'Friends: Full Name', 'MyFriendsFullNames')
  DataSupplier.registerDataSupplier('public.text', 'Friends: Random', 'MyFriendsNamesRandom')
  DataSupplier.registerDataSupplier('public.text', 'Groups: Name', 'MyGroupsNames')
  DataSupplier.registerDataSupplier('public.text', 'Video Title by..', 'VideoTitleByOwnerID')
  DataSupplier.registerDataSupplier('public.text', 'Video Views by..', 'VideoViewsByOwnerID')

  getData('stats.trackVisitor', {
    'access_token': ACCESS_TOKEN,
    'v': API_VERSION
  })
}

export function onShutdown() {
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
      })
    })
    .catch(error => {
      UI.message('Something went wrong')
      console.error(error)
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
        })
      })
      .catch(error => {
        UI.message('Something went wrong')
        console.error(error)
      })
  }
}

export function onMyFriends(context) {
  let selection = context.data.items.length
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
      })
    })
    .catch(error => {
      UI.message('Something went wrong')
      console.error(error)
    })
}

export function onMyGroups(context) {
  let selection = context.data.items.length
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
      })
    })
    .catch(error => {
      UI.message('Something went wrong')
      console.error(error)
    })
}

export function onMyFriendsFirstNames(context) {
  let selection = context.data.items.length
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
      })
    })
    .catch(error => {
      UI.message('Something went wrong')
      console.error(error)
    })
}

export function onMyFriendsFullNames(context) {
  let selection = context.data.items.length
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
      })
    })
    .catch(error => {
      UI.message('Something went wrong')
      console.error(error)
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
      })
    })
    .catch(function(error) {
      UI.message('Something went wrong')
      console.error(error)
    })
}

export function onMyGroupsNames(context) {
  let selection = context.data.items.length
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
      })
    })
    .catch(error => {
      UI.message('Something went wrong')
      console.error(error)
    })
}

export function onVideoByOwnerID(context) {
  let selection = context.data.items.length
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
        })
      })
      .catch(error => {
        UI.message('Something went wrong')
        console.error(error)
      })
  }
}

export function onVideoTitleByOwnerID(context) {
  let selection = context.data.items.length
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
        })
      })
      .catch(error => {
        UI.message('Something went wrong')
        console.error(error)
      })
  }
}

export function onVideoViewsByOwnerID(context) {
  let selection = context.data.items.length
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
        })
      })
      .catch(error => {
        UI.message('Something went wrong')
        console.error(error)
      })
  }
}

export function onMyFriendsRandom(context) {
  let selection = context.data.items.length

  if (Settings.settingForKey('RandomID') == undefined) {
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

          if (response['items'][index].photo_200 == undefined) {
            process(response['items'][index].photo_100, dataKey, index, item)
          } else {
            process(response['items'][index].photo_200, dataKey, index, item)
          }
        })
      })
      .catch(error => {
        UI.message('Something went wrong')
        console.error(error)
      })
  } else {
    let userids = Settings.settingForKey('RandomID').join(',')
    getData('users.get', {
        'user_ids': userids,
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
        })
        Settings.setSettingForKey('RandomID', undefined)
      })
      .catch(error => {
        UI.message('Something went wrong')
        console.error(error)
      })
  }
}

export function onMyFriendsNamesRandom(context) {
  let selection = context.data.items.length

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

          DataSupplier.supplyDataAtIndex(dataKey, response['items'][index].first_name, index)
        })
      })
      .catch(error => {
        UI.message('Something went wrong')
        console.error(error)
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
        Settings.setSettingForKey('RandomID', undefined)
      })
      .catch(error => {
        UI.message('Something went wrong')
        console.error(error)
      })
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

function process(data, dataKey, index, item) {
  return getImageFromURL(data).then(imagePath => {
    if (!imagePath) {
      return
    }
    DataSupplier.supplyDataAtIndex(dataKey, imagePath, index)

    if (item.type != 'DataOverride') {
      Settings.setLayerSettingForKey(item, SETTING_KEY, data.id)
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