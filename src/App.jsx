
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Html5Qrcode } from 'html5-qrcode'

const STORAGE_KEY = 'attic-organizer-boxes'

function App() {
  const [boxes, setBoxes] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []
    } catch {
      return []
    }
  })

  const [boxName, setBoxName] = useState('')
  const [itemName, setItemName] = useState('')
  const [selectedBox, setSelectedBox] = useState(null)
  const [search, setSearch] = useState('')
  const [qrImage, setQrImage] = useState('')
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(boxes))
  }, [boxes])

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
      (decodedText) => {
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

  function addBox(e) {
    e.preventDefault()
    if (!boxName.trim()) return

    const newBox = {
      id: crypto.randomUUID(),
      name: boxName.trim(),
      items: []
    }

    setBoxes(previous => [...previous, newBox])
    setBoxName('')
    setSelectedBox(newBox.id)
  }

  function addItem(e) {
    e.preventDefault()
    if (!itemName.trim() || !selectedBox) return

    setBoxes(previous =>
      previous.map(box =>
        box.id === selectedBox
          ? { ...box, items: [...box.items, itemName.trim()] }
          : box
      )
    )

    setItemName('')
  }

  function deleteBox(id) {
    if (!confirm('Delete this box and all its items?')) return
    setBoxes(previous => previous.filter(box => box.id !== id))
    if (selectedBox === id) setSelectedBox(null)
  }

  function deleteItem(index) {
    setBoxes(previous =>
      previous.map(box =>
        box.id === selectedBox
          ? { ...box, items: box.items.filter((_, i) => i !== index) }
          : box
      )
    )
  }

  const selected = boxes.find(box => box.id === selectedBox)

  const filteredBoxes = boxes.filter(box =>
    box.name.toLowerCase().includes(search.toLowerCase()) ||
    box.items.some(item =>
      item.toLowerCase().includes(search.toLowerCase())
    )
  )

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
        @media(max-width: 550px) {
          .detail { grid-template-columns: 1fr; }
          .qr { width: 150px; }
          .form-row { flex-direction: column; }
        }
      `}</style>

      <header>
        <h1>📦 Attic Organizer</h1>
        <p>Know exactly what's inside every box.</p>
      </header>

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
          <div className="empty">No boxes found. Add your first box above.</div>
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
                  <img src={qrImage} alt="Box QR code" className="qr" />
                  <a
                    href={qrImage}
                    download={`${selected.name}-QR.png`}
                  >
                    Download QR label
                  </a>
                </>
              )}
              <p className="muted">Print this code and attach it to your box.</p>
            </div>
          </div>
        </section>
      )}

      <p className="muted" style={{ textAlign: 'center', marginTop: 25 }}>
        Attic Organizer · Household Inventory
      </p>
    </div>
  )
}

export default App
