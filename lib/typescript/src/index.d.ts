declare type SocksPortNumber = number;
export declare type RequestHeaders = {
    [header: string]: string;
} | {};
export declare type ResponseHeaders = {
    [header: string]: string | string[];
};
/**
 * Supported Request types
 * @todo PUT
 */
export declare enum RequestMethod {
    'GET' = "get",
    'POST' = "post",
    'DELETE' = "delete"
}
/**
 * Supported Body Payloads for the respective RequestMethod
 */
export interface RequestBody {
    [RequestMethod.GET]: undefined;
    [RequestMethod.POST]: string;
    [RequestMethod.DELETE]: string | undefined;
}
/**
 * Response returned from a successfully executed request
 */
export interface RequestResponse<T = any> {
    /**
     * Content mimeType returned by server
     */
    mimeType: string;
    /**
     * Base64 encoded string of data returned by server
     */
    b64Data: string;
    /**
     * String indexed object for headers returned by Server
     */
    headers: ResponseHeaders;
    /**
     * The response code for the request as returned by the server
     * Note: a respCode > 299 is considered an error by the client and throws
     */
    respCode: number;
    /**
     * If the mimeType of the payload is valid JSON then this field will
     * be populated with parsed JSON (object)
     */
    json?: T;
}
interface ProcessedRequestResponse extends RequestResponse {
}
/**
 * Native module interface
 * Used internally, public calls should be made on the returned TorType
 */
interface NativeTor {
    startDaemon(timeoutMs: number, cb: (x: any) => void): number;
    stopDaemon(cb: (x: number) => void): Promise<number>;
    getDaemonStatus(): string;
    request<T extends RequestMethod>(url: string, method: T, data: string, // native side expects string for body
    headers: RequestHeaders, trustInvalidSSL: boolean, cb: (x: any) => void): Promise<RequestResponse>;
    startTcpConn(target: string, timeoutMs: number): Promise<string>;
    sendTcpConnMsg(target: string, msg: string, timeoutSeconds: number): Promise<boolean>;
    stopTcpConn(target: string): Promise<boolean>;
    createHiddenService(hiddenServicePort: number, destinationPort: number, secretKey?: string): Promise<HiddenServiceParam>;
    deleteHiddenService(onion: string): Promise<boolean>;
    startHttpHiddenserviceHandler(port: number): Promise<String>;
    stopHttpHiddenserviceHandler(id: number): Promise<boolean>;
}
/**
 * HiddenServiceDataHandler data handler.
 * If err is populated then there was an error
 */
declare type HiddenServiceDataHandler = (data?: HttpServiceRequest, err?: string) => void;
/**
 * Data returned when createHiddenService is called
 * @field onionUrl The public url (with the port) that can be used to access this hidden service (note you must call startHttpService before you can actually get any data)
   @field secretKey Base64 encoded ESCDA private key for this service. *DO NOT* share this key and store it securely. This key can be used to restore the hidden service by anyone!
 */
interface HiddenServiceParam {
    onionUrl: string;
    secretKey: string;
}
/**
 * Data provided by the HTTP server attached to a hidden service
 */
interface HttpServiceRequest {
    method: RequestMethod;
    headers: {
        [header: string]: string;
    };
    body: string;
    version: number;
    path: string;
}
declare const _createHiddenService: (hiddenServicePort: number, destinationPort: number, secretKey?: string | undefined) => Promise<HiddenServiceParam>;
declare const _deleteHiddenService: (onion: string) => Promise<boolean>;
declare const _startHttpService: (port: number, cb: HiddenServiceDataHandler) => Promise<{
    close: () => any;
}>;
/**
 * Tcpstream data handler.
 * If err is populated then there was an error
 */
declare type TcpConnDatahandler = (data?: string, err?: string) => void;
/**
 * Interface returned by createTcpConnection factory
 */
interface TcpStream {
    /**
     * Called to close and end the Tcp connection
     */
    close(): Promise<boolean>;
    /**
     * Send a message (write on socket)
     * @param msg
     */
    write(msg: string): Promise<boolean>;
}
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
declare const _createTcpConnection: (param: {
    target: string;
    connectionTimeout?: number;
    writeTimeout?: number;
    numberConcurrentWrites?: number;
}, onData: TcpConnDatahandler) => Promise<TcpStream>;
/**
 * We expose _createTcpConnection publicly as a wrapped queue to avoid JS->Native bridge hang issue for non V8 engines
 */
declare const createTcpConnection: (param: {
    target: string;
    connectionTimeout?: number | undefined;
    writeTimeout?: number | undefined;
    numberConcurrentWrites?: number | undefined;
}, onData: TcpConnDatahandler) => ReturnType<typeof _createTcpConnection>;
declare type TorType = {
    /**
     * Send a GET request routed through the SOCKS proxy on the native side
     * Starts the Tor Daemon automatically if not already started
     * @param url
     * @param headers
     * @param trustSSL
     */
    get(url: string, headers?: RequestHeaders, trustSSL?: boolean): Promise<ProcessedRequestResponse>;
    /**
     * Send a POST request routed through the SOCKS proxy on the native side
     * Starts the Tor Daemon automatically if not already started
     * @param url
     * @param body
     * @param headers
     * @param trustSSL
     */
    post(url: string, body: RequestBody[RequestMethod.POST], headers?: RequestHeaders, trustSSL?: boolean): Promise<ProcessedRequestResponse>;
    /**
     * Send a DELETE request routed through the SOCKS proxy on the native side
     * Starts the Tor Daemon automatically if not already started
     * @param url
     * @param headers
     * @param trustSSL
     */
    delete(url: string, body?: RequestBody[RequestMethod.DELETE], headers?: RequestHeaders, trustSSL?: boolean): Promise<ProcessedRequestResponse>;
    /** Starts the Tor Daemon if not started and returns a promise that fullfills with the socks port number when boostraping is complete.
     * If the function was previously called it will return the promise without attempting to start the daemon again.
     * Useful when used as a guard in your transport or action layer
     */
    startIfNotStarted(): Promise<SocksPortNumber>;
    /**
     * Stops a running Tor Daemon
     */
    stopIfRunning(): Promise<void>;
    /**
     * Returns the current status of the Daemon
     * Some :
     * NOTINIT - Not initialized or run (call startIfNotStarted to the startDaemon)
     * STARTING - Daemon is starting and bootsraping
     * DONE - Daemon has completed boostraing and socks proxy is ready to be used to route traffic.
     * <other> - A status returned directly by the Daemon that can indicate a transient state or error.
     */
    getDaemonStatus(): string;
    /**
     * Accessor the Native request function
     * Should not be used unless you know what you are doing.
     */
    request: NativeTor['request'];
    /**
     * Factory function for creating a peristant Tcp connection to a target
     * See createTcpConnectio;
     */
    createTcpConnection: typeof createTcpConnection;
    createHiddenService: typeof _createHiddenService;
    deleteHiddenService: typeof _deleteHiddenService;
    startHttpService: typeof _startHttpService;
};
declare const _default: ({ stopDaemonOnBackground, startDaemonOnActive, bootstrapTimeoutMs, numberConcurrentRequests, os, }?: {
    stopDaemonOnBackground?: boolean | undefined;
    startDaemonOnActive?: boolean | undefined;
    bootstrapTimeoutMs?: number | undefined;
    numberConcurrentRequests?: number | undefined;
    os?: "ios" | "android" | "windows" | "macos" | "web" | undefined;
}) => TorType;
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
export default _default;
