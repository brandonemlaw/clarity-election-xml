import { app, BrowserWindow } from 'electron';
import path, { dirname } from 'path';
import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import AdmZip from 'adm-zip';
import xml2js from 'xml2js';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import Store from 'electron-store';  // Import electron-store

(async () => {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const userDocumentsPath = app.getPath('documents');

    const server = express();
    const PORT = 3000;

    const store = new Store();  // Create a new store instance

    // Load persisted data or initialize default values
    let urlConfig = store.get('urlConfig', []);
    console.log("loaded ")
    console.log(urlConfig)
    let pollInterval = store.get('pollInterval', 60000);

    server.use(bodyParser.json());
    server.use(express.static(path.join(__dirname, 'react-ui', 'build')));

    server.get('/api/config', (req, res) => {
      res.json({ urlConfig, pollInterval });
    });

    server.post('/api/refresh', (req, res) => {
      poll();
      res.status(200);
    });

    server.post('/api/config', async (req, res) => {
      const { url } = req.body;

      try {
        const metadata = await fetchAndParseMetadata(url);
        urlConfig = [...urlConfig, { url, ...metadata }];

        // Persist updated configuration
        store.set('urlConfig', urlConfig);

        res.json({ message: 'Configuration updated', urlConfig });
      } catch (error) {
        console.error('Error updating config:', error);
        res.status(500).json({ message: 'Failed to update configuration' });
      }
    });

    server.post('/api/setRefresh', async (req, res) => {
      const { pollInterval: newPollInterval } = req.body;
      pollInterval = newPollInterval;

      try {
        store.set('pollInterval', pollInterval);
        startPolling();
        res.status(200);
      } catch (error) {
        console.error('Error updating poll interval:', error);
        res.status(500).json({ message: 'Failed to update poll interval' });
      }
    });

    server.delete('/api/config', (req, res) => {
      const { url } = req.body;
      urlConfig = urlConfig.filter(entry => entry.url !== url);

      // Persist updated configuration
      store.set('urlConfig', urlConfig);

      res.json({ message: 'URL deleted', urlConfig });
      
    });

    async function fetchAndParseMetadata(url) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);

      const buffer = await response.buffer();
      const zip = new AdmZip(buffer);
      const detailXml = zip.getEntry('detail.xml');

      if (!detailXml) throw new Error('detail.xml not found in ZIP');

      const xmlContent = detailXml.getData().toString('utf8');
      const parsedData = await xml2js.parseStringPromise(xmlContent);

      return {
        electionName: parsedData.ElectionResult.ElectionName[0],
        electionDate: parsedData.ElectionResult.ElectionDate[0],
        region: parsedData.ElectionResult.Region[0],
      };
    }

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
    
        return contests.map(contest => {
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

          let result = {
            Contest: {}
          };

          (contest.Choice || []).forEach(choice => {
            overallTotalVotes += parseInt(choice.$.totalVotes, 10) || 0;
          });
    
          (contest.Choice || []).forEach((choice, index) => {
            const fullName = choice.$.text;
            const totalVotesCount = parseInt(choice.$.totalVotes, 10) || 0;
            const votePercentage = Math.trunc((totalVotesCount / overallTotalVotes) * 100);
    
            const { name, title, ending, party } = parseNameAndParty(fullName);

            const adjustedName = name.replace(/[^\w]/gi, '')
            console.log(name)
            result["Contest"][`${adjustedName}Percent`] = `${votePercentage}%`;
            result["Contest"][`${adjustedName}Votes`] = `${totalVotesCount}%`;

            const candidateIndex = index + 1;
            names[`Name${candidateIndex}`] = name;
            parties[`Party${candidateIndex}`] = party;
            titles[`Title${candidateIndex}`] = title;
            endings[`Ending${candidateIndex}`] = ending;
            totalVotes[`TotalVotes${candidateIndex}`] = totalVotesCount.toLocaleString();
            votePercentages[`VotePercentage${candidateIndex}`] = `${votePercentage}%`;
          });

          result["Contest"]["Key"] = contestKey;
          result["Contest"]["RaceTitle"] = raceTitle;
          result["Contest"]["ReportingPercent"] = reportingPercent;
          result["Contest"]["Names"] = names;
          result["Contest"]["Titles"] = titles;
          result["Contest"]["Endings"] = endings;
          result["Contest"]["Parties"] = parties;
          result["Contest"]["TotalVotes"] = totalVotes;
          result["Contest"]["VotePercentages"] = votePercentages;

          return result;
        });
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
    
      return { name, title, ending, party };    }


    async function poll() {
      if (urlConfig.length === 0) return;

      function removeSpecialChars(value) {
        return value.replaceAll("/", "-").replaceAll("\\", "-").replaceAll(",", "-").replaceAll(".", "")
      }
      
      for (const entry of urlConfig) {
        const { url, electionName, electionDate, region } = entry;
        try {
          console.log(`Polling data from ${url}`);
          const contests = await fetchAndParseData(url);
          console.log(`Parsed data`);

          if (contests) {
            await fs.mkdir(path.join(userDocumentsPath, 'ClarityElectionXMLFiles'), { recursive: true });

            for (const contest of contests) {
              const builder = new xml2js.Builder({ headless: true });
              const simplifiedXmlContent = builder.buildObject({ Contest: contest });

              const contestFileName = `${removeSpecialChars(entry.electionName)}-${removeSpecialChars(entry.electionDate)}.${removeSpecialChars(contest.Contest.RaceTitle)}.xml`;
              const contestFilePath = path.join(userDocumentsPath, 'ClarityElectionXMLFiles', contestFileName);

              await fs.writeFile(contestFilePath, simplifiedXmlContent);

              console.log(`Contest ${contest.Contest.RaceTitle} written to ${contestFilePath}`);
            }
          }
        } catch (error) {
          console.error(`Error polling data from ${url}:`, error);
        }
      }
    }
    
    async function startPolling() {
      setTimeout(poll, pollInterval);
      poll().catch(error => {
        console.error('Polling error:', error);
      });
    }

    app.on('ready', () => {
      console.log('Electron app is ready.');

      server.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
      });

      const win = new BrowserWindow({
        width: 600,
        height: 700,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          contextIsolation: true,
        },
      });

      win.loadURL(`http://localhost:${PORT}`);

      // Start polling immediately after app is ready and server is started
      startPolling();
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