const qrcode = require('qrcode-terminal');
qrcode.generate('exp://j1w0tbc-anonymous-8081.exp.direct', { small: true }, function (qr) {
    console.log("===BEGIN QR===");
    console.log(qr);
    console.log("===END QR===");
});
