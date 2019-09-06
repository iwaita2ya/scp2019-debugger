var buf1 = new Buffer(2);
buf1[0] = 0x00;
buf1[1] = 0x80;
console.log(buf1.readInt16LE(0));

var buf2 = Buffer.from([0x00, 0x80]);
console.log(buf2.readInt16LE(0));