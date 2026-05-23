import { useState, useRef } from 'react'
import emailjs from '@emailjs/browser'

const SERVICE_ID  = import.meta.env.VITE_EMAILJS_SERVICE_ID
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID
const PUBLIC_KEY  = import.meta.env.VITE_EMAILJS_PUBLIC_KEY

export default function BugReportModal({ onClose, appName = 'HFF Tracker' }) {
  const [title,   setTitle]   = useState('')
  const [body,    setBody]    = useState('')
  const [contact, setContact] = useState('')
  const [status,  setStatus]  = useState('idle') // idle | sending | sent | error
  const formRef = useRef()

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim() || !body.trim()) return
    setStatus('sending')
    try {
      await emailjs.send(
        SERVICE_ID,
        TEMPLATE_ID,
        { app_name: appName, bug_title: title, bug_body: body, reporter_contact: contact || '(미입력)' },
        PUBLIC_KEY
      )
      setStatus('sent')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-header">
          <h2 id="modal-title" className="modal-title">버그 리포트</h2>
          <button className="modal-close" onClick={onClose} aria-label="닫기">✕</button>
        </div>

        {status === 'sent' ? (
          <div className="modal-sent">
            <div className="modal-sent-icon">✓</div>
            <p className="modal-sent-msg">리포트가 전송됐어요. 피드백 감사합니다!</p>
            <button className="btn-primary" onClick={onClose}>닫기</button>
          </div>
        ) : (
          <form ref={formRef} onSubmit={handleSubmit} className="modal-form">
            <label className="modal-label">
              제목 <span className="modal-required">*</span>
              <input
                className="modal-input"
                type="text"
                placeholder="어떤 문제인지 한 줄로 적어주세요"
                value={title}
                onChange={e => setTitle(e.target.value)}
                disabled={status === 'sending'}
                maxLength={100}
              />
            </label>

            <label className="modal-label">
              내용 <span className="modal-required">*</span>
              <textarea
                className="modal-textarea"
                placeholder={"어떤 상황에서 발생했나요?\n어떻게 재현할 수 있나요?\n어떤 결과를 예상했나요?"}
                value={body}
                onChange={e => setBody(e.target.value)}
                disabled={status === 'sending'}
                rows={6}
              />
            </label>

            <label className="modal-label">
              연락처 <span className="modal-optional">(선택)</span>
              <input
                className="modal-input"
                type="text"
                placeholder="답변 받을 이메일 또는 연락처"
                value={contact}
                onChange={e => setContact(e.target.value)}
                disabled={status === 'sending'}
              />
            </label>

            {status === 'error' && (
              <p className="modal-error">전송에 실패했어요. 잠시 후 다시 시도해 주세요.</p>
            )}

            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={status === 'sending'}>
                취소
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={status === 'sending' || !title.trim() || !body.trim()}
              >
                {status === 'sending' ? '전송 중…' : '보내기'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
