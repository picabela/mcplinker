export const calendarDay=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const movablePost=p=>Boolean(p.scheduled_at)&&['draft','approval','scheduled'].includes(p.status);
export function movedDate(original,day){
 const d=new Date(original);if(!Number.isFinite(d.getTime())||!/^\d{4}-\d{2}-\d{2}$/.test(day))throw new Error('Nieprawidłowa data.');
 const [y,m,n]=day.split('-').map(Number),h=d.getHours(),min=d.getMinutes();const next=new Date(y,m-1,n,h,min,d.getSeconds(),d.getMilliseconds());
 if(calendarDay(next)!==day||next.getHours()!==h||next.getMinutes()!==min)throw new Error('Ta godzina nie istnieje w wybranym dniu z powodu zmiany czasu. Wybierz termin w formularzu.');
 return next.toISOString();
}
