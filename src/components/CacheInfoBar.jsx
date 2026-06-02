import { cacheBasisText } from '../utils/cacheInfo'

export default function CacheInfoBar({ cacheStatus, endpoints }) {
  return (
    <div className={`cache-info-bar ${cacheStatus?.state || 'idle'}`}>
      {cacheBasisText(cacheStatus, endpoints)}
    </div>
  )
}
