import { C } from './UI';

export default function UserAvatar({ user, src, name, size = 36, radius = 10, initialsLength = 2, background = C.accent, style = {} }) {
  const image = src || user?.avatar_url || '';
  const label = name || user?.username || '?';
  const initials = String(label).trim().slice(0, initialsLength).toUpperCase() || '?';

  return <span style={{ width:size, height:size, borderRadius:radius, background, display:'inline-flex', alignItems:'center', justifyContent:'center', overflow:'hidden', flexShrink:0, fontSize:Math.max(11, Math.round(size * .34)), fontWeight:900, color:'#fff', ...style }}>
    {image ? <img src={image} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : initials}
  </span>;
}
