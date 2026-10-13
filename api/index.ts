// Entry point untuk Vercel (serverless). Semua request diarahkan ke sini lewat vercel.json.
// package.json memakai "type": "commonjs", jadi ekspor app dengan `export =` (=> module.exports).
import { createApp } from "../src/app";

const app = createApp();

export = app;
