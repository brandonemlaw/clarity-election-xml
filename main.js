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
    const userDocumentsPath = app.getPath('documents');

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
        const parsedData = await xml2js.parseStringPromise(xmlContent);
    
        const contests = parsedData.ElectionResult.Contest || [];
    
        const contestsXml = contests.map(contest => {
          const contestKey = contest.$.key;
          const raceTitle = contest.$.text;
          const reportingPercent = Math.trunc(parseFloat(contest.$.precinctsReportingPercent));
    
          const names = {};
          const parties = {};
          const titles = {};
          const endings = {};
          const totalVotes = {};
          const votePercentages = {};
    
          let overallTotalVotes = 0;
    
          (contest.Choice || []).forEach(choice => {
            overallTotalVotes += parseInt(choice.$.totalVotes, 10) || 0;
          });
    
          (contest.Choice || []).forEach((choice, index) => {
            const fullName = choice.$.text;
            const totalVotesCount = parseInt(choice.$.totalVotes, 10) || 0;
            const votePercentage = Math.trunc((totalVotesCount / overallTotalVotes) * 100);
    
            const { name, title, ending, party } = parseNameAndParty(fullName);
    
            const candidateIndex = index + 1;
            names[`Name${candidateIndex}`] = name;
            parties[`Party${candidateIndex}`] = party;
            titles[`Title${candidateIndex}`] = title;
            endings[`Ending${candidateIndex}`] = ending;
            totalVotes[`TotalVotes${candidateIndex}`] = totalVotesCount.toLocaleString();
            votePercentages[`VotePercentage${candidateIndex}`] = votePercentage;
          });
    
          return {
            Contest: {
              Key: contestKey,
              RaceTitle: raceTitle,
              ReportingPercent: reportingPercent,
              Names: names,
              Titles: titles,
              Endings: endings,
              Parties: parties,
              TotalVotes: totalVotes,
              VotePercentages: votePercentages,
            },
          };
        });
    
        const builder = new xml2js.Builder({ headless: true });
        const simplifiedXmlContent = builder.buildObject({ Contests: contestsXml });
    
        return simplifiedXmlContent;
      } catch (error) {
        console.error('Error fetching or parsing data:', error);
        return null;
      }
    }
    
    function parseNameAndParty(fullName) {
      let name = fullName;
      let title = '';
      let ending = '';
      let party = '';
    
      const partyMatch = fullName.match(/\(([^)]+)\)/);
      if (partyMatch) {
        party = partyMatch[1].charAt(0);
        name = name.replace(partyMatch[0], '').trim();
      }
    
      const titleMatch = name.match(/^(Dr\.|Rep\.|Sen\.)\s+/);
      if (titleMatch) {
        title = titleMatch[1];
        name = name.replace(titleMatch[0], '').trim();
      }
    
      const endingMatch = name.match(/(Sr\.|Jr\.|III)$/);
      if (endingMatch) {
        ending = endingMatch[1];
        name = name.replace(endingMatch[0], '').trim();
      }
    
      return { name, title, ending, party };
    }

    async function startPolling() {
      if (urls.length === 0) return;

      async function poll() {
        for (const url of urls) {
          const parsedData = await fetchAndParseData(url);
          if (parsedData) {
            const fileName = `${new URL(url).hostname}-${Date.now()}.xml`;
            const filePath = path.join(userDocumentsPath, 'ClarityElectionXMLFiles', fileName);

            await fs.mkdir(path.join(userDocumentsPath, 'ClarityElectionXMLFiles'), { recursive: true });
            await fs.writeFile(filePath, parsedData);

            console.log(`Data from ${url} written to ${filePath}`);          }
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
          preload: path.join(__dirname, 'preload.js'),
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