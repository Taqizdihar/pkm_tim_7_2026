import type { ReactNode } from 'react';

function emphasis(text: string): ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*)/g).map((part,index)=>part.startsWith('**')&&part.endsWith('**')?<strong key={index}>{part.slice(2,-2)}</strong>:part);
}

// A small text-only Markdown subset. HTML, images, and links are never interpreted.
export function AnswerText({text}:{text:string}) {
  const nodes:ReactNode[]=[];
  const lines=text.split('\n');
  for(let i=0;i<lines.length;i++) {
    const line=lines[i];
    if(!line.trim())continue;
    if(/^#{1,3}\s/.test(line)){nodes.push(<h3 key={i}>{emphasis(line.replace(/^#{1,3}\s+/,''))}</h3>);continue;}
    const unordered=/^\s*[-*]\s+/.test(line),ordered=/^\s*\d+[.)]\s+/.test(line);
    if(unordered||ordered){
      const start=i,items:ReactNode[]=[];
      const pattern=unordered?/^\s*[-*]\s+/:/^\s*\d+[.)]\s+/;
      while(i<lines.length&&pattern.test(lines[i])){items.push(<li key={i}>{emphasis(lines[i].replace(pattern,''))}</li>);i++;}
      i--;nodes.push(unordered?<ul key={start}>{items}</ul>:<ol key={start}>{items}</ol>);continue;
    }
    const start=i,paragraph=[line];
    while(i+1<lines.length&&lines[i+1].trim()&&!/^\s*(?:#{1,3}\s|[-*]\s|\d+[.)]\s)/.test(lines[i+1]))paragraph.push(lines[++i]);
    nodes.push(<p key={start}>{emphasis(paragraph.join('\n'))}</p>);
  }
  return <div className="consultation-answer">{nodes}</div>;
}
