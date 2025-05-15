import React, { useState, useEffect } from 'react';
import axios from 'axios';

function App() {
  const [memoryEntries, setMemoryEntries] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [memoryLayerFilter, setMemoryLayerFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch memory entries from backend API
  const fetchMemoryEntries = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (searchQuery) params.search = searchQuery;
      if (memoryLayerFilter !== 'all') params.layer = memoryLayerFilter;
      const response = await axios.get('/api/memory', { params });
      setMemoryEntries(response.data);
    } catch (err) {
      setError('Failed to load memory entries');
    } finally {
      setLoading(false);
    }
  };

  // Fetch developer profiles from backend API
  const fetchProfiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get('/api/profiles');
      setProfiles(response.data);
    } catch (err) {
      setError('Failed to load developer profiles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMemoryEntries();
    fetchProfiles();
  }, []);

  // Search handler
  const handleSearch = () => {
    fetchMemoryEntries();
  };

  // Select memory entry
  const handleSelectEntry = (entry) => {
    setSelectedEntry(entry);
    setSelectedProfile(null);
  };

  // Select profile
  const handleSelectProfile = (profile) => {
    setSelectedProfile(profile);
    setSelectedEntry(null);
  };

  // Delete memory entry
  const handleDeleteEntry = async (id) => {
    if (!window.confirm("Are you sure you want to delete this memory entry?")) return;
    try {
      await axios.delete(\`/api/memory/\${id}\`);
      fetchMemoryEntries();
      setSelectedEntry(null);
    } catch (err) {
      alert("Failed to delete memory entry");
    }
  };

  // Update memory entry content
  const handleUpdateEntry = async () => {
    if (!selectedEntry) return;
    try {
      await axios.put(\`/api/memory/\${selectedEntry.id}\`, { content: selectedEntry.content, tags: selectedEntry.tags });
      fetchMemoryEntries();
      alert("Memory entry updated");
    } catch (err) {
      alert("Failed to update memory entry");
    }
  };

  // Update profile content
  const handleUpdateProfile = async () => {
    if (!selectedProfile) return;
    try {
      await axios.put(\`/api/profiles/\${selectedProfile.id}\`, selectedProfile);
      fetchProfiles();
      alert("Profile updated");
    } catch (err) {
      alert("Failed to update profile");
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ width: '25%', borderRight: '1px solid #ccc', padding: '10px', overflowY: 'auto' }}>
        <h2>Memory Entries</h2>
        <div>
          <input
            type="text"
            placeholder="Search memory..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            style={{ width: '100%', marginBottom: '5px' }}
          />
          <select value={memoryLayerFilter} onChange={(e) => setMemoryLayerFilter(e.target.value)} style={{ width: '100%', marginBottom: '10px' }}>
            <option value="all">All Layers</option>
            <option value="session">Session</option>
            <option value="project">Project</option>
            <option value="global">Global</option>
          </select>
        </div>
        {loading && <p>Loading...</p>}
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {memoryEntries.map((entry) => (
            <li
              key={entry.id}
              onClick={() => handleSelectEntry(entry)}
              style={{
                padding: '5px',
                cursor: 'pointer',
                backgroundColor: selectedEntry && selectedEntry.id === entry.id ? '#e0e0e0' : 'transparent',
                borderBottom: '1px solid #ddd',
              }}
            >
              <strong>{entry.title || 'Untitled'}</strong>
              <br />
              <small>Layer: {entry.layer}</small>
            </li>
          ))}
        </ul>
      </div>

      <div style={{ width: '25%', borderRight: '1px solid #ccc', padding: '10px', overflowY: 'auto' }}>
        <h2>Developer Profiles</h2>
        {loading && <p>Loading...</p>}
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {profiles.map((profile) => (
            <li
              key={profile.id}
              onClick={() => handleSelectProfile(profile)}
              style={{
                padding: '5px',
                cursor: 'pointer',
                backgroundColor: selectedProfile && selectedProfile.id === profile.id ? '#e0e0e0' : 'transparent',
                borderBottom: '1px solid #ddd',
              }}
            >
              <strong>{profile.name || profile.id}</strong>
              <br />
              <small>{profile.email || ''}</small>
            </li>
          ))}
        </ul>
      </div>

      <div style={{ flexGrow: 1, padding: '10px', overflowY: 'auto' }}>
        {selectedEntry && (
          <div>
            <h2>Memory Entry Detail</h2>
            <label>
              Title:
              <input
                type="text"
                value={selectedEntry.title || ''}
                onChange={(e) => setSelectedEntry({ ...selectedEntry, title: e.target.value })}
                style={{ width: '100%', marginBottom: '5px' }}
              />
            </label>
            <label>
              Layer:
              <input
                type="text"
                value={selectedEntry.layer}
                readOnly
                style={{ width: '100%', marginBottom: '5px', backgroundColor: '#f0f0f0' }}
              />
            </label>
            <label>
              Content:
              <textarea
                value={selectedEntry.content || ''}
                onChange={(e) => setSelectedEntry({ ...selectedEntry, content: e.target.value })}
                rows={10}
                style={{ width: '100%', marginBottom: '5px' }}
              />
            </label>
            <label>
              Tags (comma separated):
              <input
                type="text"
                value={selectedEntry.tags ? selectedEntry.tags.join(', ') : ''}
                onChange={(e) =>
                  setSelectedEntry({ ...selectedEntry, tags: e.target.value.split(',').map((t) => t.trim()) })
                }
                style={{ width: '100%', marginBottom: '10px' }}
              />
            </label>
            <button onClick={handleUpdateEntry} style={{ marginRight: '10px' }}>
              Save
            </button>
            <button onClick={() => handleDeleteEntry(selectedEntry.id)} style={{ backgroundColor: '#f44336', color: 'white' }}>
              Delete
            </button>
          </div>
        )}

        {selectedProfile && (
          <div>
            <h2>Developer Profile Detail</h2>
            <label>
              Name:
              <input
                type="text"
                value={selectedProfile.name || ''}
                onChange={(e) => setSelectedProfile({ ...selectedProfile, name: e.target.value })}
                style={{ width: '100%', marginBottom: '5px' }}
              />
            </label>
            <label>
              Email:
              <input
                type="email"
                value={selectedProfile.email || ''}
                onChange={(e) => setSelectedProfile({ ...selectedProfile, email: e.target.value })}
                style={{ width: '100%', marginBottom: '5px' }}
              />
            </label>
            <label>
              Bio:
              <textarea
                value={selectedProfile.bio || ''}
                onChange={(e) => setSelectedProfile({ ...selectedProfile, bio: e.target.value })}
                rows={5}
                style={{ width: '100%', marginBottom: '10px' }}
              />
            </label>
            <button onClick={handleUpdateProfile}>Save</button>
          </div>
        )}

        {!selectedEntry && !selectedProfile && <p>Select a memory entry or developer profile to view details.</p>}
      </div>
    </div>
  );
}

export default App;
