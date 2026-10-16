import { ClipboardCopy } from 'lucide-react'
import { useState } from 'react'
import { paymentConfig } from '../config/site'

/**
 * The owner's UPI ID and QR code. The QR image is only shown when the UPI ID being displayed is the one the image was made for, so a
 * changed UPI ID can never sit next to an old QR code.
 */
export function PaymentDetails({ upiId = paymentConfig.upiId, payeeName = paymentConfig.payeeName }: { upiId?: string; payeeName?: string }) {
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle')
  const showQr = upiId.trim().toLowerCase() === paymentConfig.upiId.toLowerCase()

  async function copy() {
    try {
      await navigator.clipboard.writeText(upiId)
      setCopied('copied')
    } catch {
      setCopied('failed')
    }
  }

  return (
    <div className="card card--flat pay">
      <dl className="summary">
        <div><dt>UPI ID</dt><dd>{upiId}</dd></div>
        {payeeName && <div><dt>Name on the account</dt><dd>{payeeName}</dd></div>}
      </dl>
      <div className="cluster">
        <button type="button" className="btn btn--ghost btn--sm" onClick={copy}><ClipboardCopy size={16} aria-hidden="true" /> Copy UPI ID</button>
        <span role="status" className="hint">{copied === 'copied' ? 'Copied.' : copied === 'failed' ? 'Couldn’t copy. Please select and copy it.' : ''}</span>
      </div>
      {showQr && (
        <figure className="pay__qr">
          <img src={paymentConfig.qrImage} alt={`UPI QR code for ${payeeName || 'the account'}. UPI ID ${upiId}.`} width={300} />
          <figcaption className="hint">Scan with any UPI app. Check that the name and UPI ID shown in your app match the ones above before you pay.</figcaption>
        </figure>
      )}
    </div>
  )
}
