const targetPort = '/dev/ttyUSB0';
const SerialPort = require('serialport');
const {once} = require('events');
const fs = require("fs");
const { createReadStream } = require('fs');
const { createInterface } = require('readline');
const path = require('path');
const dateFormat = require('dateformat');
// const dumpFileName = '20190820_02_parachute.dump';
// const dumpFilePath = path.resolve(__dirname, 'dumps', dumpFileName);

/**
 * zeroPadding
 * @param string
 * @param padSize
 * @param padChar
 * @returns {*}
 */
const zeroPadding = (string, padSize=8, padChar='0') => {
    while (string.length < (padSize || 2)) {string = padChar + string;}
    return string;
};

/**
 * 設定読み込み
 */
process.env.NODE_CONFIG_DIR = path.join(__dirname, 'config');
const config = require('config');
const filePrefix = config.get('parachute.file_prefix');
/**
 * ファイル準備
 */
// 日付取得
const now = new Date();
const dateFormatted = dateFormat(now, "yyyymmdd");
const dateTimeFormatted = dateFormat(now, "yyyymmddHHMMss");

// dumpファイルパス＆ファイル名設定
let dumpFilePath = config.get('parachute.file_path');
if(!path.isAbsolute(dumpFilePath)) {
    dumpFilePath = path.resolve(__dirname, dumpFilePath);
}
const dumpFileName = `${filePrefix}-${dateTimeFormatted}.dump`;
dumpFilePath = path.resolve(dumpFilePath, dumpFileName);

// ログファイルパス＆ファイル名設定
let logFilePath = config.get('log.file_path');
if(!path.isAbsolute(logFilePath)) {
    logFilePath = path.resolve(__dirname, logFilePath);
}
const logFileName = filePrefix + '-' + dateFormatted + '.log';

// エラーレベル設定
const validErrorLevel = ["trace", "debug", "info", "warn", "error", "fatal"];
let errorLogLevel = config.get('log.error_level');
if((validErrorLevel.indexOf(errorLogLevel) === -1)) {
    // 指定外のエラーレベルが指定された場合は debug 扱い
    errorLogLevel = 'debug';
}

// log4js 設定
const log4js = require('log4js');
log4js.configure({
    appenders: {
        console: { type: 'console' },
        dump_parachute: { type: 'file', filename: path.join(logFilePath, logFileName) }
    },
    categories: {
        default: { appenders: ['console','dump_parachute'], level: errorLogLevel }
    }
});
const logger = log4js.getLogger();

/**
 * シリアル設定
 */
const port = new SerialPort(
    targetPort,
    {
        autoOpen: true,
        baudRate: 115200,
        dataBits: 8,
        lock: true,
        stopBits: 1,
        parity: 'none',
        rtscts: false,
        xany: false,
        xoff: false,
        xon: false
    });

// parser
const {ByteLength} = SerialPort.parsers;// バイト長で切る
const parser = port.pipe(new ByteLength({length:9}));    // バイト長で区切る場合

// data receiver
// parser.on('data', (data) => {
//     /**
//      * uint8_t _currentStatus,
//      * int16_t _gz_raw,
//      * uint8_t _aDutyIndex,
//      * uint8_t _bDutyIndex,
//      * uint16_t _aRPM,
//      * uint16_t _bRPM
//      */
//     let buf = Buffer.from(data);
//
//     const currentStatus = buf.readUInt8(0);
//     const gz_raw = buf.readInt16LE(1);
//     const aDutyIndex = buf.readUInt8(3);
//     const bDutyIndex = buf.readUInt8(4);
//     const aRPM = buf.readUInt16LE(5);
//     const bRPM = buf.readUInt16LE(7);
//
//     logger.debug(currentStatus + "," + gz_raw + "," + aDutyIndex + "," + bDutyIndex + "," + aRPM + "," + bRPM);
//
//     //TODO: ファイルに書き出す
// });

parser.on('data', (data) => {
    try {
        fs.appendFileSync(dumpFilePath, data);
    }catch(e){
        logger.error(e);
    }
});

port.on('error', err => console.error(err.message));


/**
 * Open Port
 * @param port
 * @returns {Promise}
 */
const openPort = (port) => new Promise(
    resolve => {
        port.on('open', () => {
            resolve();
        });
    }
);

/**
 * Send Command
 * @param port
 * @param commandBytes
 * @param waitMs
 * @returns {Promise}
 */
const sendCommand = (port, commandBytes, waitMs=3000) => new Promise (
    resolve => {
        port.write(Buffer.from(commandBytes), 'hex', () => {
            // 送信終わりを待つ
            port.drain(() => {
                setTimeout(() => {
                    resolve();
                }, waitMs);
            });
        });
    }
);

const readDumpFile = (filePath) => new Promise (
    resolve => {
        const fileStream = fs.createReadStream(dumpFilePath);
        const readLine = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        let byteDataSet = {};

    }
);

/**
 * Wait for specific msec
 * @param msec
 * @returns {Promise}
 */
const waitForData = (msec) => new Promise(
    resolve => {
        setTimeout(() => {
            resolve();
        }, msec);
    }
);

//------------------------------------------------
// データ送信テスト
//------------------------------------------------
(async () => {

    // Open Port
    logger.debug('Port Open.');
    await openPort(port);

    // Send Dump Command
    logger.debug('Send Dump Command');
    await sendCommand(port, [0xb0, 0x0d]); // ascii format

    await waitForData(20000);
    logger.debug(`Dump saved at: ${dumpFilePath}`);

    // Close Port
    logger.debug('Close Port');
    if(port.isOpen) {
        port.close();
    } else {
        console.warn('Port is not opened.');
    }

    /**
     * ダンプファイル解析スタート
     */
    const csvFilePath = `${dumpFilePath}.csv`;

    // Read Dump File
    logger.debug(`Read Dump File: ${dumpFilePath}`);
    try {
        const readline = createInterface({
            input: createReadStream(dumpFilePath),
            crlfDelay: Infinity
        });

        let byteDataSet = {};
        readline.on('line', (line) => {
            if(line.match(/^[0-9a-f]{4}\s([0-9a-f]{2}\s?){16}/gi)) {
                // logger.debug(line);
                const lineData = line.split(' ');
                const offset = Buffer.from(lineData.shift(), 'hex').readUInt16BE(0);
                //logger.debug(`offset:${offset}`);
                for (let i=0; i<16; i++) {
                    //logger.debug(lineData[i]);
                    byteDataSet[offset+i] = lineData[i];
                }
            } else {
                logger.trace(`SKIP: ${line}`)
            }
        });
        // await till the end of file read
        await once(readline, 'close');

        logger.debug('Parse dump data and show the result');

        /**
         * uint8_t statusFlags;
         * float pressureAtSeaLevel;   // 海抜0mの大気圧
         * uint16_t groundAltitude;    // 地表の高度
         * uint16_t currentAltitude;   // 現在の高度
         * uint8_t deployParachuteAt;  // パラシュート開放高度(地表高度に加算する値)
         * uint8_t counterThreshold;   // 状態カウンタのしきい値（この回数に達したら、その状態が発生したと判断する）
         * uint8_t altitudeThreshold;  // 状態遷移に必要な高度しきい値
         * float openServoPeriod;      // サーボ開 duty比 (0-1.0f)
         * float closeServoPeriod;     // サーボ閉 duty比 (0-1.0f)
         * uint8_t enableLogging;      // ロギング設定 (0x00:無効 0x01:有効)
         * time_t logStartTime;        // ロギング開始時刻(RTCから取得する）
         * uint16_t logPointer;        // 最終ログ格納アドレス (0x0020-0x0800)
         **/

        //TODO: display result
        const currentStatus = Buffer.from(byteDataSet[0], 'hex').readUInt8(0).toString(2);
        const pressureAtSeaLevel = Buffer.from(byteDataSet[1] + byteDataSet[2] + byteDataSet[3] + byteDataSet[4], 'hex').readFloatLE(0);
        const groundAltitude = Buffer.from(byteDataSet[5] + byteDataSet[6], 'hex').readUInt16LE(0);
        const currentAltitude = Buffer.from(byteDataSet[7] + byteDataSet[8], 'hex').readUInt16LE(0);
        const deployParachuteAt = Buffer.from(byteDataSet[9], 'hex').readUInt8(0);
        const counterThreshold = Buffer.from(byteDataSet[10], 'hex').readUInt8(0);
        const altitudeThreshold = Buffer.from(byteDataSet[11], 'hex').readUInt8(0);
        const openServoPeriod = Buffer.from(byteDataSet[12] + byteDataSet[13] + byteDataSet[14] + byteDataSet[15], 'hex').readFloatLE(0);
        const closeServoPeriod = Buffer.from(byteDataSet[16] + byteDataSet[17] + byteDataSet[18] + byteDataSet[19], 'hex').readFloatLE(0);
        const enableLogging = Buffer.from(byteDataSet[20], 'hex').readUInt8(0);
        const logStartTime = Buffer.from(byteDataSet[21] + byteDataSet[22] + byteDataSet[23] + byteDataSet[24], 'hex').readUInt32LE(0);
        const logPointer = Buffer.from(byteDataSet[25] + byteDataSet[26], 'hex').readUInt16LE(0);

        // Status Flag
        console.log('----- Config Value -----');
        console.log(`Status       : ${zeroPadding(currentStatus,8)}`);
        console.log(`Press at Sea : ${pressureAtSeaLevel} Pa`);
        console.log(`Ground Alt   : ${groundAltitude} m`);
        console.log(`Current Alt  : ${currentAltitude} m`);
        console.log(`Deploy Alt   :+${deployParachuteAt} m`);
        console.log(`Cnt Threshold: ${counterThreshold} times`);
        console.log(`Alt Threshold:+${altitudeThreshold} m`);
        console.log(`Open Period  : ${openServoPeriod} ms`);
        console.log(`Close Period : ${closeServoPeriod} ms`);
        console.log(`Enable Log : ` + (enableLogging === 1 ? 'Yes' : 'No'));
        console.log(`logStart   : ${logStartTime}`);
        console.log(`Log Pointer: 0x${zeroPadding(logPointer.toString(16), 4)}`);

        try {
            fs.appendFileSync(csvFilePath,`----- Config Value -----\r\n`);
            fs.appendFileSync(csvFilePath,`Status       : ${zeroPadding(currentStatus,8)}\r\n`);
            fs.appendFileSync(csvFilePath,`Press at Sea : ${pressureAtSeaLevel}\r\n`);
            fs.appendFileSync(csvFilePath,`Ground Alt   : ${groundAltitude}\r\n`);
            fs.appendFileSync(csvFilePath,`Current Alt  : ${currentAltitude}\r\n`);
            fs.appendFileSync(csvFilePath,`Deploy Alt   :+${deployParachuteAt}\r\n`);
            fs.appendFileSync(csvFilePath,`Cnt Threshold: ${counterThreshold}\r\n`);
            fs.appendFileSync(csvFilePath,`Alt Threshold:+${altitudeThreshold}\r\n`);
            fs.appendFileSync(csvFilePath,`Open Period  : ${openServoPeriod}\r\n`);
            fs.appendFileSync(csvFilePath,`Close Period : ${closeServoPeriod}\r\n`);
            fs.appendFileSync(csvFilePath,`Enable Log : ` + (enableLogging === 1 ? 'Yes' : 'No') + `\r\n`);
            fs.appendFileSync(csvFilePath,`logStart   : ${logStartTime}\r\n`);
            fs.appendFileSync(csvFilePath,`Log Pointer: 0x${zeroPadding(logPointer.toString(16), 4)}\r\n`);

        }catch(e){
            logger.error(e);
        }

        /**
         * uint8_t _currentStatus,
         * int16_t _gz_raw,
         * uint8_t _aDutyIndex,
         * uint8_t _bDutyIndex,
         * uint16_t _aRPM,
         * uint16_t _bRPM
         */

        console.log('----- Output Log -----');
        console.log('     ADDR, EFTOFFSI, ALT');

        try {
            fs.appendFileSync(csvFilePath,`----- Output Log -----\r\n`);
            fs.appendFileSync(csvFilePath,`     ADDR,   STATUS, ALT\r\n`);

        }catch(e){
            logger.error(e);
        }

        //MEMO: 0x20 から順番に表示
        let currentIndex = 32; // 0x20
        const dataSize = 2; // bytes for each dataset

        while (currentIndex < logPointer) {
            let dataStart = currentIndex;

            const status = Buffer.from(byteDataSet[dataStart], 'hex').readUInt8(0).toString(2);
            const currentAltitude = Buffer.from(byteDataSet[dataStart + 1], 'hex').readUInt8(0).toString();

            console.log(`${zeroPadding(dataStart.toString(16), 4)}-${zeroPadding((dataStart+1).toString(16), 4)}, ${zeroPadding(status,8)}, ${zeroPadding(currentAltitude,8)}`);

            try {
                fs.appendFileSync(csvFilePath,`${zeroPadding(dataStart.toString(16), 4)}-${zeroPadding((dataStart+1).toString(16), 4)}, ${zeroPadding(status,8)}, ${zeroPadding(currentAltitude,8)}\r\n`);

            }catch(e){
                logger.error(e);
            }

            currentIndex += dataSize;
        }

        // console.log(byteDataSet);

    } catch (err) {
        logger.error(err);
    }

    logger.debug('Dump Completed.');

})();

return 0;