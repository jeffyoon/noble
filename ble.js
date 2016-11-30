var noble = require('./index')

console.log('noble')

// Global variables
// scanned device array
var devices = []
var selectedIndex = null
var selectedDevice = null
var selectedAddress = null

var ctrlPoint = null // Connected device Control Point characteristic
var jnapData = null // Connected device JNAP Data characteristic
var ctrlPointCharId = null
var jnapDataCharId = null

var nodeDeviceServiceUuid = '000020808eab46c2b7880e9440016fd1'

function makeJNAP (action, body) {
  var payload = 'POST /JNAP/ HTTP/1.1\n' +
    'Host: 192.168.1.1\n' +
    'Content-Type: application/json\n' +
    'X-JNAP-Action: http://linksys.com/jnap/nodes/smartconnect/{action}\n' +
    'X-JNAP-Authorization: Basic YWRtaW46YWRtaW4=\n' +
    '{body}\n'

  return payload.replace(/{action}/, action).replace(/{body}/, JSON.stringify(body))
}

function findJNAPCharacteristics (services) {
  services.forEach((service, serviceId) => {
    console.log('Service UUID : ' + service.uuid)
    service.characteristics.forEach((ch, charId) => {
      console.log('Characteristic UUID : ' + ch.uuid)
      if (ch.uuid === '000020818eab46c2b7880e9440016fd1') {
        // Control Point characteristic
        ctrlPoint = ch
        ctrlPointCharId = ch.uuid
      } else if (ch.uuid === '000020828eab46c2b7880e9440016fd1') {
        // JNAP Data characteristic
        jnapData = ch
        jnapDataCharId = ch.uuid
      }
    })
  })
}

function connected (error) {
  // Callback for device connection.
  // Will kick off service discovery and grab the JNAP service and characteristics.
  if (error) {
    console.log('Error connecting: ' + error)
    return
  }

  // Connected, now kick off service discovery.
  console.log('Discovering Services...')
  selectedDevice.discoverAllServicesAndCharacteristics((error, services, characteristics) => {
    // Handle if there was an error.
    if (error) {
      console.log('Error discovering services and characteristics: ' + error)
      return
    }
    // Setup the JNAP characteristics.
    findJNAPCharacteristics(services)
  })
}

function disconnect () {
  var device = selectedDevice
  selectedDevice = null
  selectedIndex = null
  selectedAddress = null

  // Now disconnect the device
  if (device != null) {
    device.disconnect()
  }
}

function startScanning () {
  // First clear out any known and slected device.
  devices = []
  disconnect()
  // here we start scanning. we check if Bluetooth is on
  if (noble.state === 'poweredOn') {
    noble.startScanning([nodeDeviceServiceUuid], false)
    console.log('Started Scanning...')
  }
}

function stopScanning () {
  console.log('Stop Scanning...')
  noble.stopScanning()
}

function deviceConnect (deviceIndex) {
  selectedIndex = deviceIndex
  selectedDevice = devices[deviceIndex]
  selectedAddress = selectedDevice.address

  // Stop scanning and kick off connection to the node device.
  noble.stopScanning()
  console.log('Connecting to the macAddress : ' + selectedAddress)
  selectedDevice.connect(connected)
}

function deviceDisconnect () {
  if (selectedDevice !== null) {
    selectedDevice.disconnect(function (error) {
      if (error) {
        console.log('error = ' + error)
      } else {
        console.log('disconnected from peripheral: ' + selectedDevice.address)
      }
    })
  }
}

function callAction (ctrlPointCharId, jnapDataCharId, command, payload, callback) {
  if (selectedIndex !== null) {
    // Request a characteristic value to be read.
    // Grab the selected device, find the characteristic (based on its parenet service index)
    // and call its read function to kick off the read.
    if (ctrlPointCharId === '000020818eab46c2b7880e9440016fd1' && jnapDataCharId === '000020828eab46c2b7880e9440016fd1') {
      var reqData = makeJNAP(command, payload)
      var opReq = '000300' + reqData.length.toString(16).toUpperCase()
      var handle = handle

      // Subscribe to the CtrlPoint characteristic to receive the OP_JNAP_RES(0x0004) when JNAP response is ready to send the Central
      ctrlPoint.write(new Buffer('0001', 'hex'), false)
      ctrlPoint.write(new Buffer('0002', 'hex'), false)
      ctrlPoint.write(new Buffer(opReq, 'hex'), false)
      jnapData.write(new Buffer(reqData), false)

      /***
      ctrlPoint.subscribe(function (error) {
        if (error) {
          console.log('ctrlPoint subscribe error...')
        }
      })
      ***/
      ctrlPoint.notify(true)

      // Waiting for OP_JNAP_RES notification from the Unconfigured Node
      // ctrlPoint.on('read', function (data, isNotification) {})
      ctrlPoint.once('read', function (data, isNotification) {
        if (data !== null) {
          console.log('ctrl data = ' + data)
        } else {
          console.log('ctrl data is null')
        }
        jnapData.read()
        /***
        jnapData.read(function (error, data) {
          if (error) {
            console.log('jnapData read error')
          } else {
            console.log('jnapData read data = ' + data)
            if (typeof (data) !== 'undefined') {
              if (callback && typeof (callback) === 'function') {
                callback(null, data)
              }
            }
          }
        })
        ***/
        /**
        ctrlPoint.unsubscribe()
        **/
        ctrlPoint.notify(false)
        ctrlPoint.write(new Buffer('0005', 'hex'))
      })
    }

    jnapData.on('read', function (data, isNotification) {
      console.log('jnap data = ' + data)
      if (typeof (data) !== 'undefined') {
        if (callback && typeof (callback) === 'function') {
          callback(null, data)
        }
      }
    })
  }
}

noble.on('stateChange', function (state) {
  console.log('on -> stateChange: ' + state)

  if (state === 'poweredOn') {
    startScanning()
  } else {
    stopScanning()
  }
})

// For everry peripheral device we discover, run this callback.
noble.on('discover', (device) => {
  console.log('\n Discovered new device with ID ' + device.id + ':') // == device.uuid
  console.log('\t device Bluetooth address : ' + device.address)
  if (device.advertisement.localName) {
    console.log('\t device local name : ' + device.advertisement.localName)
  }
  if (device.rssi) {
    console.log('\t RSSI : ' + device.rssi)
  }
  if (device.state) {
    console.log('\t state : ' + device.state)
  }
  if (device.advertisement.serviceUuids.length) {
    console.log('\t Advertised services:' + JSON.stringify(device.advertisement.serviceUuids))
  }
  if (device.advertisement.manufacturerData) {
    console.log('\t Manufacturer data: ' + JSON.stringify(device.advertisement.manufacturerData.toString('hex')))
  }

  var index = devices.push(device) - 1
  console.log('index = ' + index)

  if (device.address === '00:16:b6:29:81:14') {
    deviceConnect(index)
    setTimeout(() => {
      callAction(ctrlPointCharId, jnapDataCharId, 'GetSlaveSetupStatus', {}, function (error, data) {
        console.log('GetSlaveSetupStatus : ' + 'error = ' + error + ', data = ' + data)
        if (error === null) {
          var body = JSON.parse(data)
          console.log('body output = ' + body.output)
        }
      })
    }, 7000)
    setTimeout(() => {
      deviceDisconnect()
    }, 37000)
  }
})
