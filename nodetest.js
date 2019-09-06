const buf1 = Buffer.alloc(2);
buf1[0] = 0x00;
buf1[1] = 0x80;
console.log(buf1.readInt16LE(0));

const buf2 = Buffer.from([0x00, 0x80]);
console.log(buf2.readInt16LE(0));


const buf3 = Buffer.from([0x07,0xf0]);
console.log(buf3.readUInt16BE(0));

console.log(Buffer.from('07F0', 'hex').readUInt16BE(0));