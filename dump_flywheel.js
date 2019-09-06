const targetPort = '/dev/ttyUSB0';
const SerialPort = require('serialport');

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

parser.on('data', (data) => {
    /**
     * uint8_t _currentStatus,
     * int16_t _gz_raw,
     * uint8_t _aDutyIndex,
     * uint8_t _bDutyIndex,
     * uint16_t _aRPM,
     * uint16_t _bRPM
     */
    let buf = Buffer.from(data);

    const currentStatus = buf.readUInt8(0);
    const gz_raw = buf.readInt16LE(1);
    const aDutyIndex = buf.readUInt8(3);
    const bDutyIndex = buf.readUInt8(4);
    const aRPM = buf.readUInt16LE(5);
    const bRPM = buf.readUInt16LE(7);

    console.log(currentStatus + "," + gz_raw + "," + aDutyIndex + "," + bDutyIndex + "," + aRPM + "," + bRPM);
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

//------------------------------------------------
// データ送信テスト
//------------------------------------------------
(async () => {

    // Open Port
    console.log('Port Open.');
    await openPort(port);

    // Send Command
    console.log('Send Command');
    await sendCommand(port, [0x40, 0x0d]);

    // Close Port
    console.log('Close Port');
    if(port.isOpen) {
        port.close();
    } else {
        console.warn('Port is not opened.');
    }

})();

return 0;