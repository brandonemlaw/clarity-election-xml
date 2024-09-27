async function main() {
  const { app, BrowserWindow } = await import('electron');
  const express = (await import('express')).default;
  const fetch = (await import('node-fetch')).default;
  const AdmZip = (await import('adm-zip')).default;
  const xml2js = (await import('xml2js')).default;
  
  // URLs to fetch data from (can be configured)
  const urls = [
    'https://results.enr.clarityelections.com/GA/63991/184321/reports/detailxml.zip'
  ];
  
  // Setup Express app
  const server = express();
  const PORT = 3000;

  async function fetchAndParseData(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
      
      const buffer = await response.buffer();
      const zip = new AdmZip(buffer);
      const detailXml = zip.getEntry('detail.xml');

      if (!detailXml) throw new Error('detail.xml not found in ZIP');

      const xmlContent = detailXml.getData().toString('utf8');
      const parsedData = await xml2js.parseStringPromise(xmlContent);

      return parsedData;
    } catch (error) {
      console.error('Error fetching or parsing data:', error);
      return null;
    }
  }

  async function startServer() {
    const allData = await Promise.all(urls.map(fetchAndParseData));

    server.get('/data', (req, res) => {
      const xmlBuilder = new xml2js.Builder();
      const xml = xmlBuilder.buildObject({ Races: allData });
      res.set('Content-Type', 'text/xml');
      res.send(xml);
    });

    server.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}/data`);
    });
  }

  app.on('ready', () => {
    startServer();
    const win = new BrowserWindow({ width: 800, height: 600 });
    win.loadURL(`http://localhost:${PORT}/data`);
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

main().catch(error => console.error('Error during app initialization:', error));