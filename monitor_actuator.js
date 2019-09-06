const targetPort = '/dev/ttyUSB0';
const SerialPort = require('serialport');

//TODO: Check target port is exists
// SerialPort.list().then(
//     ports => ports.forEach(console.log),
//     err => console.error(err)
// );

const port = new SerialPort(
    targetPort,
    {
        autoOpen: true,
        baudRate: 115200,
        dataBits: 8,
        lock: true,
        stopBits: 1,
        parity: 'none',
        rtscts: true,
        xany: false,
        xoff: false,
        xon: false
    });

// parser
const {ByteLength} = SerialPort.parsers;// バイト長で切る
const parser = port.pipe(new ByteLength({length:9}));    // バイト長で区切る場合

// const {Delimiter} = SerialPort.parsers; // 終端文字で切る
// const parser = port.pipe(new Delimiter({delimiter:[0x22, 0xDD, 0x11]}));    // 終端文字で区切る場合

// const {Readline} = SerialPort.parsers;  // 終端文字で切る(文字コード指定可)
// const parser = port.pipe(new Readline({delimiter:'\n', encoding:'utf8'}));  // 終端文字で区切る場合（文字コード指定可）

// const {Ready} = SerialPort.parsers;     // データ受信開始文字列を待つ
// const parser = port.pipe(new Ready({delimiter:[0x22, 0xDD, 0x11]}));    // 受信開始文字を待つ

// const {Regex} = SerialPort.parsers;     // データ受信開始文字列を待つ
// const parser = port.pipe(new Regex({regex:/[0x22, 0xDD, 0x11]+/}));    // 受信開始文字を待つ

// parser.on('data', data => console.log(stringToUtf8ByteArray(data)));

parser.on('data', (data) => {
        /**
         * uint8_t _currentStatus,
         * int16_t _gz_raw,
         * uint8_t _aDutyIndex,
         * uint8_t _bDutyIndex,
         * uint16_t _aRPM,
         * uint16_t _bRPM
         */
        var butterInt16;
        const currentStatus = data[0];
        butterInt16 = new Buffer(data[2],data[1]);
        const gz_raw = butterInt16.writeInt16LE();
            // console.log(stringToUtf8ByteArray(data))
            const bytesArray = stringToUtf8ByteArray(data);
});

port.on('error', err => console.error(err.message));
