const fs = require('fs');
const path = require('path');

// A 1x1 transparent PNG in base64
const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const buffer = Buffer.from(base64Png, 'base64');

const assetsDir = path.join(__dirname, 'assets');
if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

const files = ['icon.png', 'splash.png', 'adaptive-icon.png', 'favicon.png'];
files.forEach(file => {
    fs.writeFileSync(path.join(assetsDir, file), buffer);
});

console.log('Dummy icons created successfully!');
