import React, { useState, useEffect } from 'react';
import axios from 'axios';

function App() {
  const [urls, setUrls] = useState([]);
  const [pollInterval, setPollInterval] = useState(60);
  const [newUrl, setNewUrl] = useState('');

  useEffect(() => {
    axios.get('/api/config')
      .then(response => {
        setUrls(response.data.urls);
        setPollInterval(response.data.pollInterval / 1000);
      })
      .catch(error => console.error('Error fetching config:', error));
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const updatedUrls = [...urls, newUrl];
    axios.post('/api/config', {
      urls: updatedUrls,
      pollInterval: pollInterval * 1000
    })
      .then(response => {
        console.log(response.data.message);
        setUrls(updatedUrls);
        setNewUrl('');
      })
      .catch(error => console.error('Error updating config:', error));
  };

  return (
    <div>
      <h1>Configuration</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label>
            New URL:
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              required
            />
          </label>
        </div>
        <div>
          <label>
            Polling Interval (seconds):
            <input
              type="number"
              value={pollInterval}
              onChange={(e) => setPollInterval(e.target.value)}
              required
            />
          </label>
        </div>
        <button type="submit">Submit</button>
      </form>
      <h2>Configured URLs</h2>
      <ul>
        {urls.map((url, index) => (
          <li key={index}>{url}</li>
        ))}
      </ul>
    </div>
  );
}

export default App;