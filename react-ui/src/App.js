import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './styles.css';

function App() {
  const [urlConfig, setUrlConfig] = useState([]);
  const [pollInterval, setPollInterval] = useState(60);
  const [newUrl, setNewUrl] = useState('');

  useEffect(() => {
    axios.get('/api/config')
      .then(response => {
        setUrlConfig(response.data.urlConfig);
        setPollInterval(response.data.pollInterval / 1000);
      })
      .catch(error => console.error('Error fetching config:', error));
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    axios.post('/api/config', {
      url: newUrl,
      pollInterval: pollInterval * 1000
    })
    .then(response => {
      setUrlConfig(response.data.urlConfig);
      setNewUrl('');
    })
    .catch(error => console.error('Error updating config:', error));
  };

  const handleDelete = (url) => {
    axios.delete('/api/config', { data: { url } })
      .then(response => {
        setUrlConfig(response.data.urlConfig);
      })
      .catch(error => console.error('Error deleting URL:', error));
  };

  return (
    <div className="container">
      <h1>Election Configuration</h1>
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
            Refresh Time (seconds):
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

      <h2>Configured Elections</h2>
      <ul>
        {urlConfig.map((entry, index) => (
          <li key={index}>
            <strong>Name:</strong> {entry.electionName} <br />
            <strong>Date:</strong> {entry.electionDate} <br />
            <strong>Region:</strong> {entry.region} <br />
            <button onClick={() => handleDelete(entry.url)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;