import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase } from './supabase'

function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [boxes, setBoxes] = useState([])
  const [boxName, setBoxName] = useState('')
  const [itemName, setItemName] = useState('')
  const [selectedBox, setSelectedBox] = useState(null)
  const [search, setSearch] = useState('')
  const [qrImage, setQrImage] = useState('')
  const [showQR, setShowQR] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [activeTab, setActiveTab] = useState('home')

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setError(error.message)
      setSession(data?.session ?? null)
      setAuthLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        setError('')
      }
    )

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setBoxes([])
      setSelectedBox(null)
      return
    }

    let active = true

    async function loadBoxes() {
      setLoading(true)
      setError('')

      const { data, error } = await supabase
        .from('boxes')
        .select('id, name, items')
        .order('created_at', { ascending: true })

      if (!active) return

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      let cloudBoxes = (data || []).map(box => ({
        ...box,
        items: Array.isArray(box.items) ? box.items : []
      }))

      if (cloudBoxes.length === 0) {
        try {
          const oldBoxes = JSON.parse(
            localStorage.getItem('attic-organizer-boxes') || '[]'
          )

          if (oldBoxes.length > 0) {
            const { data: migrated, error: migrationError } =
              await supabase
                .from('boxes')
                .insert(oldBoxes.map(box => ({
                  id: box.id,
                  name: box.name,
                  items: box.items || []
                })))
                .select('id, name, items')

            if (migrationError) throw migrationError

            cloudBoxes = migrated || []
            localStorage.removeItem('attic-organizer-boxes')
          }
        } catch (err) {
          setError('Could not transfer old boxes: ' + err.message)
        }
      }

      if (active) {
        setBoxes(cloudBoxes)
        setLoading(false)
      }
    }

    loadBoxes()

    return () => {
      active = false
    }
  }, [session])

  useEffect(() => {
    const box = boxes.find(b => b.id === selectedBox)

    if (!box) {
      setQrImage('')
      setShowQR(false)
      return
    }

    QRCode.toDataURL(`ATTIC-BOX:${box.id}`)
      .then(setQrImage)
      .catch(console.error)
  }, [selectedBox, boxes])

  useEffect(() => {
    if (!scanning) return

    const scanner = new Html5Qrcode('reader')
    let active = true

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      decodedText => {
        if (!active) return

        const id = decodedText.replace('ATTIC-BOX:', '')
        const box = boxes.find(b => b.id === id)

        if (box) {
          setSelectedBox(box.id)
          setShowQR(false)
          setScanning(false)
          setActiveTab('boxes')
        } else {
          alert('This QR code does not match a saved box.')
        }
      },
      () => {}
    ).catch(() => {
      alert('Camera could not start. Allow camera access and try again.')
      setScanning(false)
    })

    return () => {
      active = false
      scanner.stop().catch(() => {})
    }
  }, [scanning, boxes])

  async function signIn(e) {
    e.preventDefault()
    setError('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) setError(error.message)
  }

  async function signOut() {
    setScanning(false)
    const { error } = await supabase.auth.signOut()
    if (error) setError(error.message)
  }

  async function addBox(e) {
    e.preventDefault()
    if (!boxName.trim()) return

    setError('')

    const newBox = {
      id: crypto.randomUUID(),
      name: boxName.trim(),
      items: []
    }

    const { error } = await supabase.from('boxes').insert(newBox)

    if (error) {
      setError(error.message)
      return
    }

    setBoxes(previous => [...previous, newBox])
    setBoxName('')
    setSelectedBox(newBox.id)
    setShowQR(false)
    setActiveTab('boxes')
  }

  async function addItem(e) {
    e.preventDefault()
    if (!itemName.trim() || !selectedBox) return

    const box = boxes.find(b => b.id === selectedBox)
    if (!box) return

    const updatedItems = [...box.items, itemName.trim()]

    const { error } = await supabase
      .from('boxes')
      .update({ items: updatedItems })
      .eq('id', selectedBox)

    if (error) {
      setError(error.message)
      return
    }

    setBoxes(previous => previous.map(b =>
      b.id === selectedBox ? { ...b, items: updatedItems } : b
    ))

    setItemName('')
  }

  async function deleteBox(id) {
    if (!confirm('Delete this box and all its items?')) return

    const { error } = await supabase
      .from('boxes')
      .delete()
      .eq('id', id)

    if (error) {
      setError(error.message)
      return
    }

    setBoxes(previous => previous.filter(box => box.id !== id))

    if (selectedBox === id) {
      setSelectedBox(null)
      setShowQR(false)
    }
  }

  async function deleteItem(index) {
    const box = boxes.find(b => b.id === selectedBox)
    if (!box) return

    const updatedItems = box.items.filter((_, i) => i !== index)

    const { error } = await supabase
      .from('boxes')
      .update({ items: updatedItems })
      .eq('id', selectedBox)

    if (error) {
      setError(error.message)
      return
    }

    setBoxes(previous => previous.map(b =>
      b.id === selectedBox ? { ...b, items: updatedItems } : b
    ))
  }

  function openBox(id) {
    setSelectedBox(id)
    setShowQR(false)
    setActiveTab('boxes')
  }

  function changeTab(tab) {
    if (tab !== 'camera') {
      setScanning(false)
    }

    setActiveTab(tab)
  }

  const selected = boxes.find(box => box.id === selectedBox)

  const filteredBoxes = boxes.filter(box =>
    box.name.toLowerCase().includes(search.toLowerCase()) ||
    box.items.some(item =>
      item.toLowerCase().includes(search.toLowerCase())
    )
  )

  const recentBoxes = [...boxes].slice(-3).reverse()

  if (authLoading) {
    return <div className="loading-screen">Loading Attic Organizer...</div>
  }

  if (!session) {
    return (
      <div className="login-screen">
        <style>{styles}</style>
        <section className="login-card">
          <div className="logo-icon">⌂</div>
          <h1>Attic Organizer</h1>
          <p>Sign in to access your household inventory.</p>

          <form onSubmit={signIn}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email address"
              required
            />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              required
            />
            <button className="primary-button" type="submit">
              Sign In
            </button>
          </form>

          {error && <p className="error">{error}</p>}
        </section>
      </div>
    )
  }

  return (
    <div className="app">
      <style>{styles}</style>

      <header className="top-header">
        <div className="brand">
          <div className="brand-icon">⌂</div>
          <div>
            <h1>Attic Organizer</h1>
            <p>Your home, organized.</p>
          </div>
        </div>

        <button className="settings-button" onClick={signOut} title="Sign out">
          ⚙
        </button>
      </header>

      <main className="main-content">
        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <section className="panel">Loading your boxes...</section>
        ) : (
          <>
            {activeTab === 'home' && (
              <>
                <section className="welcome">
                  <h2>Welcome back!</h2>
                  <p>Keep your storage organized and find items easily.</p>
                </section>

                <form className="add-box-form" onSubmit={addBox}>
                  <input
                    value={boxName}
                    onChange={e => setBoxName(e.target.value)}
                    placeholder="Name your new box..."
                    aria-label="New box name"
                  />
                  <button className="primary-button" type="submit">
                    + Add Box
                  </button>
                </form>

                <input
                  className="search-input"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="⌕  Search boxes..."
                />

                <div className="section-heading">
                  <h2>Your Boxes</h2>
                  <button
                    className="text-button"
                    onClick={() => changeTab('boxes')}
                  >
                    View All →
                  </button>
                </div>

                {recentBoxes.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">📦</div>
                    <h3>No boxes yet</h3>
                    <p>Add your first storage box above.</p>
                  </div>
                ) : (
                  <div className="box-list">
                    {recentBoxes
                      .filter(box =>
                        box.name.toLowerCase().includes(search.toLowerCase()) ||
                        box.items.some(item =>
                          item.toLowerCase().includes(search.toLowerCase())
                        )
                      )
                      .map(box => (
                        <div className="box-card" key={box.id}>
                          <div className="box-emoji">📦</div>
                          <button
                            className="box-info"
                            onClick={() => openBox(box.id)}
                          >
                            <strong>{box.name}</strong>
                            <span>{box.items.length} items</span>
                          </button>
                          <button
                            className="qr-button"
                            onClick={() => {
                              setSelectedBox(box.id)
                              setShowQR(true)
                            }}
                          >
                            ▦ View QR
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </>
            )}

            {activeTab === 'camera' && (
              <section className="page-section">
                <h2>Scan a Box</h2>
                <p className="page-description">
                  Point your camera at a box's QR code to see what's inside.
                </p>

                {!scanning ? (
                  <div className="camera-placeholder">
                    <div className="camera-icon">▣</div>
                    <h3>Ready to scan?</h3>
                    <p>Allow camera access when your browser asks.</p>
                    <button
                      className="primary-button"
                      onClick={() => setScanning(true)}
                    >
                      Open Camera
                    </button>
                  </div>
                ) : (
                  <>
                    <div id="reader" className="reader" />
                    <button
                      className="secondary-button"
                      onClick={() => setScanning(false)}
                    >
                      Cancel Scan
                    </button>
                  </>
                )}
              </section>
            )}

            {activeTab === 'boxes' && (
              <section className="page-section">
                <h2>All Boxes</h2>
                <p className="page-description">
                  You have {boxes.length} storage boxes.
                </p>

                <input
                  className="search-input"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="⌕  Search boxes or items..."
                />

                <div className="box-list">
                  {filteredBoxes.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon">📦</div>
                      <h3>No boxes found</h3>
                      <p>Try another search or add a box from Home.</p>
                    </div>
                  ) : (
                    filteredBoxes.map(box => (
                      <div className="box-card" key={box.id}>
                        <div className="box-emoji">📦</div>
                        <button
                          className="box-info"
                          onClick={() => {
                            setSelectedBox(box.id)
                            setShowQR(false)
                          }}
                        >
                          <strong>{box.name}</strong>
                          <span>{box.items.length} items</span>
                        </button>
                        <button
                          className="qr-button"
                          onClick={() => {
                            setSelectedBox(box.id)
                            setShowQR(true)
                          }}
                        >
                          ▦ View QR
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}

            {selected && activeTab !== 'camera' && (
              <section className="panel detail-panel">
                <div className="detail-heading">
                  <div>
                    <h2>{selected.name}</h2>
                    <p>{selected.items.length} items in this box</p>
                  </div>
                  <button
                    className="close-button"
                    onClick={() => {
                      setSelectedBox(null)
                      setShowQR(false)
                    }}
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={addItem} className="add-item-form">
                  <input
                    value={itemName}
                    onChange={e => setItemName(e.target.value)}
                    placeholder="Add an item..."
                  />
                  <button className="primary-button" type="submit">
                    Add
                  </button>
                </form>

                {selected.items.length === 0 ? (
                  <p className="empty-message">This box is empty.</p>
                ) : (
                  selected.items.map((item, index) => (
                    <div className="item-row" key={index}>
                      <span>• {item}</span>
                      <button
                        className="remove-button"
                        onClick={() => deleteItem(index)}
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}

                {showQR && qrImage && (
                  <div className="qr-display">
                    <h3>Box QR Code</h3>
                    <img src={qrImage} alt="Box QR code" />
                    <p>Scan this code to find this box in Attic Organizer.</p>
                  </div>
                )}

                <div className="detail-actions">
                  <button
                    className="secondary-button"
                    onClick={() => setShowQR(!showQR)}
                  >
                    {showQR ? 'Hide QR Code' : 'View QR Code'}
                  </button>
                  <button
                    className="delete-button"
                    onClick={() => deleteBox(selected.id)}
                  >
                    Delete Box
                  </button>
                </div>
              </section>
            )}
          </>
        )}

        <p className="footer-text">Attic Organizer · Household Inventory</p>
      </main>

      <nav className="bottom-nav">
        <button
          className={activeTab === 'home' ? 'nav-item active' : 'nav-item'}
          onClick={() => changeTab('home')}
        >
          <span className="nav-icon">⌂</span>
          <span>Home</span>
        </button>

        <button
          className={activeTab === 'camera' ? 'nav-item active' : 'nav-item'}
          onClick={() => changeTab('camera')}
        >
          <span className="nav-icon">◎</span>
          <span>Camera</span>
        </button>

        <button
          className={activeTab === 'boxes' ? 'nav-item active' : 'nav-item'}
          onClick={() => changeTab('boxes')}
        >
          <span className="nav-icon">▦</span>
          <span>Boxes</span>
        </button>
      </nav>
    </div>
  )
}

const styles = `
  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    background: #f5f8fd;
    color: #10264b;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
  }

  button, input {
    font: inherit;
  }

  button {
    cursor: pointer;
  }

  .app {
    width: 100%;
    max-width: 850px;
    min-height: 100vh;
    margin: auto;
    padding-bottom: 115px;
  }

  .loading-screen {
    min-height: 100vh;
    display: grid;
    place-items: center;
    color: #12345d;
    background: #f5f8fd;
  }

  .top-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 25px 22px 15px;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 13px;
  }

  .brand-icon {
    width: 58px;
    height: 58px;
    display: grid;
    place-items: center;
    background: #dceeff;
    border-radius: 17px;
    color: #0757a5;
    font-size: 43px;
    font-weight: 800;
  }

  .brand h1 {
    margin: 0;
    font-size: 23px;
    font-weight: 800;
    letter-spacing: -0.8px;
  }

  .brand p {
    margin: 4px 0 0;
    color: #71809a;
    font-size: 13px;
  }

  .settings-button {
    border: 0;
    background: #e2f0ff;
    color: #0757a5;
    border-radius: 50%;
    width: 43px;
    height: 43px;
    font-size: 22px;
  }

  .main-content {
    padding: 12px 20px 20px;
  }

  .welcome {
    text-align: center;
    padding: 20px 5px 23px;
  }

  .welcome h2 {
    font-size: 32px;
    margin: 0 0 9px;
    letter-spacing: -1px;
  }

  .welcome p {
    margin: 0 auto;
    max-width: 340px;
    color: #64738c;
    font-size: 16px;
    line-height: 1.5;
  }

  .add-box-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 18px;
  }

  input {
    width: 100%;
    padding: 15px;
    border: 1px solid #d6e0ed;
    border-radius: 14px;
    background: white;
    color: #10264b;
    font-size: 16px;
    outline: none;
  }

  input:focus {
    border-color: #2387e8;
    box-shadow: 0 0 0 3px #2387e822;
  }

  .primary-button {
    border: 0;
    border-radius: 14px;
    background: #2385e5;
    color: white;
    padding: 15px 18px;
    font-size: 16px;
    font-weight: 700;
  }

  .primary-button:active {
    background: #126bc3;
  }

  .search-input {
    border-radius: 30px;
    padding: 15px 19px;
    margin-bottom: 23px;
    background: #fff;
  }

  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 13px;
  }

  .section-heading h2,
  .page-section h2 {
    font-size: 23px;
    margin: 0;
  }

  .text-button {
    border: 0;
    background: transparent;
    color: #1476d1;
    font-weight: 700;
    font-size: 15px;
    padding: 8px 0;
  }

  .box-list {
    display: grid;
    gap: 12px;
  }

  .box-card {
    display: flex;
    align-items: center;
    gap: 13px;
    padding: 14px;
    min-width: 0;
    background: white;
    border: 1px solid #e3eaf3;
    border-radius: 19px;
    box-shadow: 0 4px 13px #17365b0a;
  }

  .box-emoji {
    flex: 0 0 53px;
    width: 53px;
    height: 53px;
    display: grid;
    place-items: center;
    border-radius: 14px;
    background: #fff6e9;
    font-size: 31px;
  }

  .box-info {
    flex: 1;
    min-width: 0;
    text-align: left;
    border: 0;
    background: transparent;
    color: #10264b;
    padding: 4px 0;
  }

  .box-info strong {
    display: block;
    overflow-wrap: anywhere;
    font-size: 15px;
    margin-bottom: 5px;
  }

  .box-info span {
    color: #71809a;
    font-size: 13px;
  }

  .qr-button {
    flex: 0 0 auto;
    border: 0;
    border-radius: 13px;
    padding: 11px 10px;
    color: #0757a5;
    background: #e4f2ff;
    font-size: 12px;
    font-weight: 700;
  }

  .empty-state,
  .camera-placeholder {
    text-align: center;
    padding: 35px 20px;
    background: white;
    border: 1px solid #e3eaf3;
    border-radius: 20px;
  }

  .empty-icon,
  .camera-icon {
    font-size: 43px;
    margin-bottom: 10px;
  }

  .empty-state h3,
  .camera-placeholder h3 {
    margin: 5px 0;
  }

  .empty-state p,
  .camera-placeholder p,
  .page-description {
    color: #71809a;
    line-height: 1.5;
  }

  .page-section {
    padding-top: 15px;
  }

  .page-description {
    margin: 8px 0 20px;
  }

  .camera-placeholder .primary-button {
    margin-top: 12px;
  }

  .reader {
    width: 100%;
    overflow: hidden;
    margin: 15px 0;
    border-radius: 15px;
    background: white;
  }

  .panel,
  .detail-panel {
    padding: 19px;
    margin-top: 20px;
    background: white;
    border: 1px solid #e3eaf3;
    border-radius: 19px;
    box-shadow: 0 4px 13px #17365b0a;
  }

  .detail-heading {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: flex-start;
  }

  .detail-heading h2 {
    margin: 0 0 5px;
    overflow-wrap: anywhere;
  }

  .detail-heading p {
    margin: 0 0 15px;
    color: #71809a;
    font-size: 13px;
  }

  .close-button {
    border: 0;
    background: #edf4fb;
    color: #315273;
    border-radius: 50%;
    width: 34px;
    height: 34px;
  }

  .add-item-form {
    display: flex;
    gap: 8px;
    margin: 12px 0;
  }

  .add-item-form input {
    min-width: 0;
  }

  .add-item-form .primary-button {
    padding: 12px;
  }

  .item-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    border-bottom: 1px solid #edf0f4;
    padding: 12px 0;
  }

  .item-row span {
    overflow-wrap: anywhere;
  }

  .remove-button,
  .delete-button {
    border: 0;
    border-radius: 9px;
    padding: 9px 11px;
    color: #b42318;
    background: #fff0f0;
    font-size: 13px;
  }

  .qr-display {
    text-align: center;
    margin-top: 20px;
    padding: 18px;
    background: #f4f9ff;
    border-radius: 15px;
  }

  .qr-display img {
    display: block;
    width: 210px;
    max-width: 100%;
    margin: 12px auto;
    background: white;
    padding: 10px;
    border-radius: 12px;
  }

  .qr-display p,
  .empty-message {
    color: #71809a;
    font-size: 14px;
  }

  .detail-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 17px;
  }

  .secondary-button {
    border: 0;
    border-radius: 11px;
    padding: 12px 15px;
    color: #0757a5;
    background: #e4f2ff;
    font-weight: 650;
  }

  .error,
  .error-banner {
    color: #b42318;
  }

  .error-banner {
    padding: 12px;
    margin-bottom: 15px;
    background: #fff0f0;
    border-radius: 10px;
  }

  .footer-text {
    text-align: center;
    color: #94a1b4;
    font-size: 12px;
    margin: 30px 0 10px;
  }

  .bottom-nav {
    position: fixed;
    z-index: 10;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: space-around;
    padding: 10px 12px calc(13px + env(safe-area-inset-bottom));
    background: #c6e5ff;
    border-top: 1px solid #b3d9fa;
    box-shadow: 0 -5px 20px #17365b0d;
  }

  .nav-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 3px;
    border: 0;
    background: transparent;
    color: #315f8e;
    font-size: 12px;
    font-weight: 650;
  }

  .nav-item.active {
    color: #0757a5;
  }

  .nav-icon {
    font-size: 29px;
    line-height: 1.1;
    font-weight: 800;
  }

  .login-screen {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 20px;
    background: #f5f8fd;
  }

  .login-card {
    width: 100%;
    max-width: 410px;
    padding: 27px;
    border-radius: 20px;
    background: white;
    box-shadow: 0 5px 25px #17365b12;
  }

  .login-card h1 {
    margin: 10px 0;
    font-size: 27px;
  }

  .login-card p {
    color: #71809a;
    line-height: 1.5;
  }

  .login-card input {
    margin: 8px 0;
  }

  .login-card .primary-button {
    width: 100%;
    margin-top: 8px;
  }

  .logo-icon {
    font-size: 48px;
    color: #0757a5;
  }

  @media (min-width: 650px) {
    .main-content {
      padding-left: 30px;
      padding-right: 30px;
    }

    .add-box-form {
      flex-direction: row;
    }

    .add-box-form input {
      flex: 1;
    }

    .add-box-form .primary-button {
      min-width: 150px;
    }
  }
`

export default App
