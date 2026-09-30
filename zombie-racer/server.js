import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const distDir = path.join(__dirname, 'dist');

app.use(express.static(distDir));
app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Zombie Racer server on :${port}`);
});
