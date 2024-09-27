import { app, BrowserWindow } from 'electron';
import path, { dirname } from 'path';
import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import AdmZip from 'adm-zip';
import xml2js from 'xml2js';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
(async () => {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    const { app, BrowserWindow } = await import('electron');
    const path = await import('path');
    const express = (await import('express')).default;
    const bodyParser = (await import('body-parser')).default;
    const fetch = (await import('node-fetch')).default;
    const AdmZip = (await import('adm-zip')).default;
    const xml2js = (await import('xml2js')).default;
    const fs = (await import('fs')).promises;

    const server = express();
    const PORT = 3000;

    let urls = [];
    let pollInterval = 60000;

    server.use(bodyParser.json());
    server.use(express.static(path.join(__dirname, 'react-ui', 'build')));

    server.get('/api/config', (req, res) => {
      res.json({ urls, pollInterval });
    });

    server.post('/api/config', (req, res) => {
      const { urls: newUrls, pollInterval: newPollInterval } = req.body;
      urls = newUrls;
      pollInterval = newPollInterval;
      res.json({ message: 'Configuration updated' });
      startPolling();
    });

    server.get('/files/:name', async (req, res) => {
      const filePath = path.join(__dirname, 'xml-files', req.params.name);
      try {
        const fileContent = await fs.readFile(filePath, 'utf8');
        res.set('Content-Type', 'text/xml');
        res.send(fileContent);
      } catch (err) {
        res.status(404).send('File not found');
      }
    });

    async function fetchAndParseData(url) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);

        const buffer = await response.buffer();
        const zip = new AdmZip(buffer);
        const detailXml = zip.getEntry('detail.xml');

        if (!detailXml) throw new Error('detail.xml not found in ZIP');

        const xmlContent = detailXml.getData().toString('utf8');
        return xml2js.parseStringPromise(xmlContent);
      } catch (error) {
        console.error('Error fetching or parsing data:', error);
        return null;
      }
    }

    async function startPolling() {
      if (urls.length === 0) return;

      async function poll() {
        for (const url of urls) {
          const parsedData = await fetchAndParseData(url);
          if (parsedData) {
            const xmlBuilder = new xml2js.Builder();
            const xmlContent = xmlBuilder.buildObject(parsedData);

            const fileName = `${new URL(url).hostname}-${Date.now()}.xml`;
            const filePath = path.join(__dirname, 'xml-files', fileName);

            await fs.mkdir(path.join(__dirname, 'xml-files'), { recursive: true });
            await fs.writeFile(filePath, xmlContent);

            console.log(`Data from ${url} written to ${fileName}`);
          }
        }
        setTimeout(poll, pollInterval);
      }

      poll();
    }

    app.on('ready', () => {
      console.log('Electron app is ready.');

      server.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
      });

      const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'), // If you need to use a preload script
          contextIsolation: true,
        },
      });

      win.loadURL(`http://localhost:${PORT}`);
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

  } catch (error) {
    console.error('Error during initialization:', error);
  }
})();