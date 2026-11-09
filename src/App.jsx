
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
  const [scanning, setScanning] = useState(false)

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
          setScanning(false)
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
    if (selectedBox === id) setSelectedBox(null)
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

  function viewQR() {
    if (!qrImage) return

    const imageWindow = window.open('', '_blank')

    if (!imageWindow) {
      alert('Allow pop-ups for this website, then try again.')
      return
    }

    imageWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Box QR Code</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              font-family: Arial, sans-serif;
              text-align: center;
              padding: 25px;
              background: #f4f5f7;
            }
            img {
              width: 280px;
              max-width: 90%;
              background: white;
              padding: 15px;
              border-radius: 12px;
            }
            button {
              padding: 12px 18px;
              margin-top: 20px;
              border: 0;
              border-radius: 8px;
              background: #20242b;
              color: white;
              font-size: 16px;
            }
          </style>
        </head>
        <body>
          <h2>Attic Organizer QR Label</h2>
          <img src="${qrImage}" alt="Box QR code">
          <br>
          <button onclick="window.print()">Print QR Label</button>
        </body>
      </html>
    `)

    imageWindow.document.close()
  }

  const selected = boxes.find(box => box.id === selectedBox)

  const filteredBoxes = boxes.filter(box =>
    box.name.toLowerCase().includes(search.toLowerCase()) ||
    box.items.some(item =>
      item.toLowerCase().includes(search.toLowerCase())
    )
  )

  if (authLoading) {
    return <div className="app"><h2>Loading Attic Organizer...</h2></div>
  }

  if (!session) {
    return (
      <div className="app">
        <style>{`
          * { box-sizing: border-box; }
          body { margin: 0; background: #f4f5f7; font-family: Arial, sans-serif; color: #20242b; }
          .app { max-width: 950px; margin: auto; padding: 24px 16px; }
          .panel { background: white; padding: 20px; border-radius: 13px; margin: 20px 0; }
          input { width: 100%; padding: 12px; border: 1px solid #d6d9df; border-radius: 8px; font-size: 15px; margin-bottom: 10px; }
          button { border: 0; border-radius: 8px; padding: 12px 15px; background: #20242b; color: white; cursor: pointer; }
          .error { color: #b42318; }
        `}</style>

        <section className="panel">
          <h1>📦 Attic Organizer</h1>
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

            <button type="submit">Sign In</button>
          </form>

          {error && <p className="error">{error}</p>}
        </section>
      </div>
    )
  }

  return (
    <div className="app">
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #f4f5f7; font-family: Arial, sans-serif; color: #20242b; }
        .app { max-width: 950px; margin: auto; padding: 24px 16px; }
        header { background: #17191e; color: white; padding: 25px; border-radius: 15px; margin-bottom: 22px; }
        header h1 { margin: 0 0 7px; font-size: 27px; }
        header p { color: #c5c8ce; margin: 0; }
        .panel { background: white; padding: 20px; border-radius: 13px; margin-bottom: 18px; box-shadow: 0 2px 9px #0000000b; }
        h2 { font-size: 19px; margin-top: 0; }
        input { width: 100%; padding: 12px; border: 1px solid #d6d9df; border-radius: 8px; font-size: 15px; margin-bottom: 10px; }
        button { border: 0; border-radius: 8px; padding: 11px 15px; background: #20242b; color: white; cursor: pointer; font-size: 14px; }
        button.secondary { background: #e9ebef; color: #20242b; }
        button.danger { background: #fff0f0; color: #b42318; }
        .form-row { display: flex; gap: 9px; }
        .form-row input { flex: 1; min-width: 0; }
        .box-list { display: grid; grid-template-columns: repeat(auto-fill,minmax(190px,1fr)); gap: 12px; }
        .box-card { border: 1px solid #e1e3e8; border-radius: 10px; padding: 15px; text-align: left; background: white; color: #20242b; }
        .box-card.active { border: 2px solid #20242b; background: #f7f7f8; }
        .box-card strong { display: block; font-size: 16px; margin-bottom: 6px; }
        .muted { color: #737984; font-size: 13px; }
        .detail { display: grid; grid-template-columns: 1fr 180px; gap: 20px; align-items: start; }
        .qr { width: 170px; max-width: 100%; }
        .item { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding: 11px 0; gap: 10px; }
        .empty { color: #777; text-align: center; padding: 20px; }
        .reader { margin-top: 15px; }
        .error { color: #b42318; }
        @media(max-width: 550px) {
          .detail { grid-template-columns: 1fr; }
          .qr { width: 150px; }
          .form-row { flex-direction: column; }
        }
      `}</style>

      <header>
        <h1>📦 Attic Organizer</h1>
        <p>Know exactly what's inside every box.</p>
        <p style={{ marginTop: 12 }}>
          Signed in as {session.user.email}
        </p>
        <button className="secondary" onClick={signOut}>
          Sign Out
        </button>
      </header>

      {error && <section className="panel error">{error}</section>}

      {loading ? (
        <section className="panel">Loading your household boxes...</section>
      ) : (
        <>
          <section className="panel">
            <h2>Add a storage box</h2>
            <form onSubmit={addBox} className="form-row">
              <input
                value={boxName}
                onChange={e => setBoxName(e.target.value)}
                placeholder="Example: Box 1 - Holiday Decorations"
              />
              <button type="submit">+ Add Box</button>
            </form>
          </section>

          <section className="panel">
            <h2>Find something</h2>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search boxes or items..."
            />
            <button onClick={() => setScanning(!scanning)}>
              {scanning ? 'Cancel Scan' : '📷 Scan a QR Code'}
            </button>
            {scanning && <div id="reader" className="reader" />}
          </section>

          <section className="panel">
            <h2>Your storage boxes ({filteredBoxes.length})</h2>

            {filteredBoxes.length === 0 ? (
              <div className="empty">
                No boxes found. Add your first box above.
              </div>
            ) : (
              <div className="box-list">
                {filteredBoxes.map(box => (
                  <button
                    key={box.id}
                    className={`box-card ${selectedBox === box.id ? 'active' : ''}`}
                    onClick={() => setSelectedBox(box.id)}
                  >
                    <strong>📦 {box.name}</strong>
                    <span className="muted">{box.items.length} items</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {selected && (
            <section className="panel">
              <div className="detail">
                <div>
                  <h2>{selected.name}</h2>
                  <p className="muted">Contents of this box</p>

                  <form onSubmit={addItem} className="form-row">
                    <input
                      value={itemName}
                      onChange={e => setItemName(e.target.value)}
                      placeholder="Add an item..."
                    />
                    <button type="submit">Add Item</button>
                  </form>

                  {selected.items.length === 0 ? (
                    <p className="empty">This box is empty.</p>
                  ) : (
                    selected.items.map((item, index) => (
                      <div className="item" key={index}>
                        <span>{item}</span>
                        <button
                          className="danger"
                          onClick={() => deleteItem(index)}
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  )}

                  <button
                    className="danger"
                    style={{ marginTop: 20 }}
                    onClick={() => deleteBox(selected.id)}
                  >
                    Delete Box
                  </button>
                </div>

                <div>
                  <h3>Box QR Code</h3>
                  {qrImage && (
                    <>
                      <img
                        src={qrImage}
                        alt="Box QR code"
                        className="qr"
                      />
                      <br />
                      <button
                        style={{ marginTop: 10 }}
                        onClick={viewQR}
                      >
                        View QR Code
                      </button>
                    </>
                  )}
                  <p className="muted">
                    Open, save, or print this code and attach it to your box.
                  </p>
                </div>
              </div>
            </section>
          )}
        </>
      )}

      <p className="muted" style={{ textAlign: 'center', marginTop: 25 }}>
        Attic Organizer · Household Inventory
      </p>
    </div>
  )
}

export default App
