import { fileUrl, fileDownloadUrl } from '../../hooks/useLegal'

/** Heutiges Datum in Ortszeit als 'YYYY-MM-DD'. */
export function todayIso() {
  return new Date().toLocaleDateString('sv-SE')
}

export function FileLinks({ fileIds = [], fileNames = {} }) {
  if (!fileIds.length) return <span className="faint">keine Datei</span>
  return (
    <span className="legal-files">
      {fileIds.map((id) => (
        <span key={id}>
          <a href={fileUrl(id)} target="_blank" rel="noreferrer">{fileNames[id] || 'Datei'}</a>
          {' '}
          <a href={fileDownloadUrl(id)} className="faint">(herunterladen)</a>
        </span>
      ))}
    </span>
  )
}
