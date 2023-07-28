import { NativeModules, DeviceEventEmitter, NativeEventEmitter, AppState, Platform } from 'react-native';
import { queue } from 'async';

/**
 * Supported Request types
 * @todo PUT
 */
export let RequestMethod;
/**
 * Supported Body Payloads for the respective RequestMethod
 */

(function (RequestMethod) {
  RequestMethod["GET"] = "get";
  RequestMethod["POST"] = "post";
  RequestMethod["DELETE"] = "delete";
})(RequestMethod || (RequestMethod = {}));

const _createHiddenService = async (hiddenServicePort, destinationPort, secretKey) => {
  let hiddenServiceJson = await NativeModules.TorBridge.createHiddenService(hiddenServicePort, destinationPort, secretKey !== null && secretKey !== void 0 ? secretKey : '');
  console.log('RnTor:CreateHiddenService', hiddenServiceJson);
  return JSON.parse(hiddenServiceJson);
};

const _deleteHiddenService = async onion => {
  await NativeModules.TorBridge.deleteHiddenService(onion);
  return true;
};

const _startHttpService = async (port, cb) => {
  let serviceId = await NativeModules.TorBridge.startHttpHiddenserviceHandler(port);
  const lsnr_handle = [];
  /**
   * Handles errors from Tcp Connection
   * Mainly check for EOF (connection closed/end of stream) and removes lnsers
   */

  const onError = async event => {
    console.error('RNTor:HttpServiceHandler:', event);
    cb(undefined, event);
  };

  const onData = async event => {
    const httpRequest = JSON.parse(event);
    console.log('RNTor:HttpServiceHandler', httpRequest);
    cb(httpRequest, undefined);
  };

  if (Platform.OS === 'android') {
    lsnr_handle.push(DeviceEventEmitter.addListener("".concat(serviceId, "-data"), event => {
      onData(event);
    }));
    lsnr_handle.push(DeviceEventEmitter.addListener("".concat(serviceId, "-error"), async event => {
      await onError(event);
    }));
  } else if (Platform.OS === 'ios') {
    const emitter = new NativeEventEmitter(NativeModules.TorBridge);
    lsnr_handle.push(emitter.addListener("hsServiceHttpHandlerRequest", event => {
      const [uuid, data] = event.split('||', 2);

      if (serviceId === uuid) {
        onData(data);
      }
    }));
    lsnr_handle.push(emitter.addListener("hsServiceHttpHandlerError", async event => {
      const [uuid, data] = event.split('||', 2);

      if (serviceId === uuid) {
        await onError(data);
      }
    }));
  }

  const close = () => {
    lsnr_handle.map(e => e.remove());
    return NativeModules.TorBridge.stopHttpHiddenserviceHandler(serviceId);
  };

  return {
    close
  };
}; //-----------

/**
 * Tcpstream data handler.
 * If err is populated then there was an error
 */


/**
 * /**
 * Factory function to create a persistent TcpStream connection to a target.
 * Wraps the native side emitter and subscribes to the targets data messages (string).
 * The TcpStream currently emits per line of data received . That is it reads data from the socket until a new line is reached, at which time
 * it will emit the data read (by calling onData(data,null). If an error is received or the connection is dropped it onData will be called
 * with the second parameter containing the error string (ie onData(null,'some error');
 * Note: Receiving an 'EOF' error from the target we're connected to signifies the end of a stream or the target dropped the connection.
 *       This will cause the module to drop the TcpConnection and remove all data event listeners.
 *       Should you wish to reconnect to the target you must initiate a new connection by calling createTcpConnection again.
 * @param param {target: string, writeTimeout: number, connectionTimeout: number } :
 *        `target` onion to connect to (ex: kciybn4d4vuqvobdl2kdp3r2rudqbqvsymqwg4jomzft6m6gaibaf6yd.onion:50001)
 *        'writeTimeout' in seconds to wait before timing out on writing to the socket (Defaults to 7)
 *        'connectionTimeout' in MilliSeconds to wait before timing out on connecting to the Target (Defaults to 15000 = 15 seconds)
 *        'numberConcurrentWrites' Number of maximum messages to write concurrently on the Tcp socket. Defaults to 4. If more than numberConcurrentWrites messages are recieved they are placed on queue to be dispatched as soon as a previous message write resolves.
 * @param onData TcpConnDatahandler node style callback called when data or an error is received for this connection
 * @returns TcpStream
 */
const _createTcpConnection = async (param, onData) => {
  const {
    target
  } = param;
  const connectionTimeout = param.connectionTimeout || 15000;
  const writeQueueConcurrency = param.numberConcurrentWrites || 4;
  const connId = await NativeModules.TorBridge.startTcpConn(target, connectionTimeout);
  let lsnr_handle = [];
  /**
   * Handles errors from Tcp Connection
   * Mainly check for EOF (connection closed/end of stream) and removes lnsers
   */

  const onError = async event => {
    if (event.toLowerCase() === 'eof') {
      console.warn("Got to end of stream on TcpStream to ".concat(target, " having connection Id ").concat(connId, ". Removing listners"));

      try {
        await close();
      } catch (err) {
        console.warn('RnTor: onError close execution error', err);
      }
    }
  };

  if (Platform.OS === 'android') {
    lsnr_handle.push(DeviceEventEmitter.addListener("".concat(connId, "-data"), event => {
      onData(event);
    }));
    lsnr_handle.push(DeviceEventEmitter.addListener("".concat(connId, "-error"), async event => {
      await onError(event);
      await onData(undefined, event);
    }));
  } else if (Platform.OS === 'ios') {
    const emitter = new NativeEventEmitter(NativeModules.TorBridge);
    lsnr_handle.push(emitter.addListener("torTcpStreamData", event => {
      const [uuid, data] = event.split('||', 2);

      if (connId === uuid) {
        onData(data);
      }
    }));
    lsnr_handle.push(emitter.addListener("torTcpStreamError", async event => {
      const [uuid, data] = event.split('||', 2);

      if (connId === uuid) {
        await onError(data);
        await onData(undefined, data);
      }
    }));
  }

  const writeTimeout = param.writeTimeout || 7;

  const write = msg => NativeModules.TorBridge.sendTcpConnMsg(connId, msg, writeTimeout);

  const close = () => {
    lsnr_handle.map(e => e.remove());
    return NativeModules.TorBridge.stopTcpConn(connId);
  };
  /**
   * Wrap write with a JS queue for non V8 engines
   */


  const writeMessageQueue = queue(async (payload, cb) => {
    const {
      msg,
      res,
      rej
    } = payload;

    try {
      const result = await write(msg);
      res(result);
    } catch (err) {
      rej(err);
    } finally {
      cb();
    }
  }, writeQueueConcurrency);
  writeMessageQueue.drain(() => console.log('notice: All tcpConnection write messages requests have been disptached..'));
  return {
    close,
    write: msg => new Promise((res, rej) => writeMessageQueue.push({
      msg,
      res,
      rej
    }))
  };
};

const createTcpConnQueue = queue(async (payload, cb) => {
  const {
    param,
    res,
    rej
  } = payload;

  try {
    const result = await _createTcpConnection(...param);
    res(result);
  } catch (err) {
    console.error('error creating tcp conn', err);
    rej(err);
  } finally {
    cb();
  }
}, 1);
createTcpConnQueue.drain(() => console.log('notice: All requested TcpConnections requests have been dispatched..'));
/**
 * We expose _createTcpConnection publicly as a wrapped queue to avoid JS->Native bridge hang issue for non V8 engines
 */

const createTcpConnection = (...param) => new Promise((res, rej) => {
  createTcpConnQueue.push({
    param,
    res,
    rej
  });
});

const TorBridge = NativeModules.TorBridge;
/**
 * Tor module factory function
 * @param stopDaemonOnBackground
 * @default true
 * When set to true will shutdown the Tor daemon when the application is backgrounded preventing pre-emitive shutdowns by the OS
 * @param startDaemonOnActive
 * @default false
 * When set to true will automatically start/restart the Tor daemon when the application is bought back to the foreground (from the background)
 * @param numberConcurrentRequests If sent to > 0 this will instruct the module to queue requests on the JS side before sending them over the Native bridge. Requests will get exectued with numberConcurrentRequests concurent requests. Note setting this to 0 disables JS sided queueing and sends requests directly to Native bridge as they are recieved. This is useful if you're running the stock/hermes RN JS engine that has a tendency off breaking under heavy multithreaded work. If you using V8 you can set this to 0 to disable JS sided queueing and thus get maximum performance.
 * @default 4
 * @param os The OS the module is running on (Set automatically and is provided as an injectable for testing purposes)
 * @default The os the module is running on.
 */

export default (({
  stopDaemonOnBackground = true,
  startDaemonOnActive = false,
  bootstrapTimeoutMs = 25000,
  numberConcurrentRequests = 4,
  os = Platform.OS
} = {}) => {
  let bootstrapPromise;
  let lastAppState = 'active';
  let _appStateLsnerSet = false;
  let requestQueue;

  if (numberConcurrentRequests > 0) {
    requestQueue = queue(async (task, cb) => {
      const {
        res,
        rej,
        request
      } = task;

      try {
        const result = await request();
        res(result);
      } catch (err) {
        rej(err);
      } finally {
        cb();
      }
    }, numberConcurrentRequests);
    requestQueue.drain(() => console.log('notice: Request queue has been processed'));
  }

  const _handleAppStateChange = async nextAppState => {
    if (startDaemonOnActive && lastAppState.match(/background/) && nextAppState === 'active') {
      const status = NativeModules.TorBridge.getDaemonStatus(); // Daemon should be in NOTINIT status if coming from background and this is enabled, so if not shutodwn and start again

      if (status !== 'NOTINIT') {
        await stopIfRunning();
      }

      startIfNotStarted();
    }

    if (stopDaemonOnBackground && lastAppState.match(/active/) && nextAppState === 'background') {
      const status = NativeModules.TorBridge.getDaemonStatus();

      if (status !== 'NOTINIT') {
        await stopIfRunning();
      }
    }

    lastAppState = nextAppState;
  };

  const startIfNotStarted = () => {
    if (!bootstrapPromise) {
      bootstrapPromise = NativeModules.TorBridge.startDaemon(bootstrapTimeoutMs);
    }

    return bootstrapPromise;
  };

  const stopIfRunning = async () => {
    console.warn('Stopping Tor daemon.');
    bootstrapPromise = undefined;
    await NativeModules.TorBridge.stopDaemon();
  };
  /**
   * Post process request result
   */


  const onAfterRequest = async (res) => {
    if (os === 'android') {
      // Mapping JSONObject to ReadableMap for the bridge is a bit of a manual shitshow
      // so android JSON will be returned as string from the other side and we parse it here
      //
      if (res !== null && res !== void 0 && res.json) {
        const json = JSON.parse(res.json);
        return { ...res,
          json
        };
      }
    }

    return res;
  }; // Register app state lsner only once


  if (!_appStateLsnerSet) {
    AppState.addEventListener('change', _handleAppStateChange);
  }
  /**
   * Wraps requests to be queued or executed directly.
   * numberConcurrentRequests > 0 will cause tasks to be wrapped in a JS side queue
   */


  const requestQueueWrapper = request => {
    return new Promise((res, rej) => {
      var _requestQueue;

      return numberConcurrentRequests > 0 ? (_requestQueue = requestQueue) === null || _requestQueue === void 0 ? void 0 : _requestQueue.push({
        request,
        res,
        rej
      }) : request().then(res).catch(rej);
    });
  };

  return {
    async get(url, headers, trustSSL = true) {
      await startIfNotStarted();
      return await onAfterRequest(await requestQueueWrapper(() => TorBridge.request(url, RequestMethod.GET, '', headers || {}, trustSSL)));
    },

    async post(url, body, headers, trustSSL = true) {
      await startIfNotStarted();
      return await onAfterRequest(await requestQueueWrapper(() => TorBridge.request(url, RequestMethod.POST, body, headers || {}, trustSSL)));
    },

    async delete(url, body, headers, trustSSL = true) {
      await startIfNotStarted();
      return await onAfterRequest(await requestQueueWrapper(() => TorBridge.request(url, RequestMethod.DELETE, body || '', headers || {}, trustSSL)));
    },

    startIfNotStarted,
    stopIfRunning,
    request: TorBridge.request,
    getDaemonStatus: TorBridge.getDaemonStatus,
    createTcpConnection,
    createHiddenService: _createHiddenService,
    deleteHiddenService: _deleteHiddenService,
    startHttpService: _startHttpService
  };
});
//# sourceMappingURL=index.js.map