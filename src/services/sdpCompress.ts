/**
 * SDP Compression for QR codes
 * Full SDP is 1500-3000 bytes - too big for reliable QR scan
 * Strip to essentials: type, key SDP lines, limited ICE candidates
 */

export function compressSDP(sdp: RTCSessionDescriptionInit): string {
  const lines = (sdp.sdp || '').split('\r\n').filter(Boolean)
  
  // Keep only essential lines: connection info, media, ICE, DTLS fingerprint
  const essential = lines.filter(line => 
    line.startsWith('v=') ||
    line.startsWith('o=') ||
    line.startsWith('s=') ||
    line.startsWith('t=') ||
    line.startsWith('m=') ||
    line.startsWith('c=') ||
    line.startsWith('a=ice-ufrag') ||
    line.startsWith('a=ice-pwd') ||
    line.startsWith('a=fingerprint') ||
    line.startsWith('a=setup') ||
    line.startsWith('a=mid') ||
    line.startsWith('a=sctp') ||
    (line.startsWith('a=candidate') && line.includes('typ host'))
  )

  // Limit to max 3 host candidates to save space
  let hostCount = 0
  const finalLines = essential.filter(line => {
    if (line.startsWith('a=candidate')) {
      hostCount++
      return hostCount <= 3
    }
    return true
  })

  const compressed = {
    t: sdp.type,
    s: finalLines.join('\n'),
  }

  return JSON.stringify(compressed)
}

export function decompressSDP(compressed: string): RTCSessionDescriptionInit {
  const data = JSON.parse(compressed)
  if (!data.t || !data.s) {
    throw new Error('Invalid compressed SDP')
  }
  const sdpLines = data.s.split('\n')
  const fullSdp = sdpLines.join('\r\n') + '\r\n'
  
  return {
    type: data.t,
    sdp: fullSdp,
  }
}
