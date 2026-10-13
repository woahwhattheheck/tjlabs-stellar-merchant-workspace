// Render the actual saved regional values. Calculation remains in the original Python engine.
const NS='http://www.w3.org/2000/svg';
const el=(tag,attributes={},value)=>{const node=document.createElementNS(NS,tag);for(const[key,item]of Object.entries(attributes))node.setAttribute(key,String(item));if(value!==undefined)node.textContent=String(value);return node;};
const html=(tag,value)=>{const node=document.createElement(tag);if(value!==undefined)node.textContent=String(value);return node;};
const useful=new Set(['unemployment_rate','unemployed','employed','labor_force','covered_employment','qtrly_estabs',
  'total_qtrly_wages','taxable_qtrly_wages','qtrly_contributions','avg_wkly_wage','quarter_average_employment']);
export const isRegionalChartRow=row=>useful.has(row?.metric);
export function regionalPosition(row){
  if(row.period_kind==='annual_average')return row.year;
  if(row.period.startsWith('Q'))return row.year*4+Number(row.period.slice(1))-1;
  return row.year*12+Number(row.period.slice(1))-1;
}
function compatible(a,b){
  const keys=['projection','area_key','metric','unit','basis','seasonal','period_kind','coverage_months','excluded_months','county_fips','definition'];
  return keys.every(key=>JSON.stringify(a[key])===JSON.stringify(b[key]));
}
function oneChart(rows,title){
  const width=800,height=330,left=88,right=24,top=26,bottom=78;
  const values=rows.filter(row=>row.value_decimal!==null&&Number.isFinite(Number(row.value_decimal))).map(row=>Number(row.value_decimal));
  if(!values.length)return html('p','All selected values in this series retain unavailable source status. The full data table remains below.');
  const positions=[...new Set(rows.map(regionalPosition))].sort((a,b)=>a-b);
  let lo=Math.min(...values),hi=Math.max(...values);
  if(lo===hi){lo-=Math.max(Math.abs(lo)*.1,1);hi+=Math.max(Math.abs(hi)*.1,1);}
  const gap=(hi-lo)*.08;lo-=gap;hi+=gap;
  const x=n=>left+(positions.at(-1)===positions[0] ? 0.5 : (n-positions[0])/(positions.at(-1)-positions[0]))*(width-left-right);
  const y=n=>top+(hi-n)/(hi-lo)*(height-top-bottom);
  const svg=el('svg',{viewBox:'0 0 '+width+' '+height,role:'img','aria-label':title});svg.append(el('title',{},title),el('rect',{width:'100%',height:'100%',fill:'white'}));
  for(let i=0;i<5;i++){const value=lo+(hi-lo)*i/4,py=y(value);svg.append(el('path',{d:'M'+left+','+py+'H'+(width-right),stroke:'#d5d5d5'}),
    el('text',{x:left-8,y:py+4,'text-anchor':'end','font-size':12,fill:'#222'},Number(value.toPrecision(6)).toLocaleString()));}
  const labels=new Map(rows.map(row=>[regionalPosition(row),row.period_kind==='annual_average'?String(row.year):row.year+'-'+row.period]));
  const ticks=new Set(),steps=Math.min(5,positions.length-1);
  if(!steps)ticks.add(0);else for(let i=0;i<=steps;i++)ticks.add(Math.round(i*(positions.length-1)/steps));
  for(const index of ticks){const position=positions[index];svg.append(el('text',{x:x(position),y:height-bottom+22,'text-anchor':'middle','font-size':11,fill:'#222'},labels.get(position)));}
  const areas=[...new Set(rows.map(row=>row.area_key))].sort((a,b)=>(a==='region'?-1:b==='region'?1:a.localeCompare(b)));
  const dashes=['','7 3','2 3','9 3 2 3','12 4','2 2 6 2','1 4','6 2 1 2','12 2 2 2'];
  areas.forEach((area,index)=>{
    const selected=rows.filter(row=>row.area_key===area).sort((a,b)=>regionalPosition(a)-regionalPosition(b));
    let previous=null,path=[];
    for(const row of selected){
      if(row.value_decimal===null||!Number.isFinite(Number(row.value_decimal))){previous=null;continue;}
      const pos=regionalPosition(row),px=x(pos),py=y(Number(row.value_decimal));
      const join=previous&&regionalPosition(previous)+1===pos&&compatible(previous,row);
      path.push((join?'L':'M')+px.toFixed(2)+','+py.toFixed(2));
      const point=el('circle',{cx:px,cy:py,r:2.6,stroke:'#111',fill:'white'});
      point.append(el('title',{},row.area_name+' · '+labels.get(pos)+' · '+row.value_decimal+' '+row.unit));svg.append(point);
      previous=row;
    }
    svg.append(el('path',{d:path.join(' '),fill:'none',stroke:'#111','stroke-width':area==='region'?2.4:1.4,'stroke-dasharray':dashes[index%dashes.length]}));
    const lx=22+(index%3)*265,ly=height-42+Math.floor(index/3)*16;
    svg.append(el('path',{d:'M'+lx+','+ly+'h25',stroke:'#111','stroke-width':2,'stroke-dasharray':dashes[index%dashes.length]}),
      el('text',{x:lx+31,y:ly+4,'font-size':11,fill:'#222'},selected[0].area_name));
  });
  return svg;
}
export function createRegionalCharts(rows){
  const groups=new Map();
  for(const row of rows){
    if(!isRegionalChartRow(row))continue;
    const key=[row.projection,row.metric,row.period_kind].join(':');
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);
  }
  const fragment=document.createDocumentFragment();
  for(const[key,values]of [...groups].sort(([a],[b])=>a.localeCompare(b))){
    const first=values[0],title=first.projection.toUpperCase()+' · '+first.measure_name+' · '+first.period_kind.replaceAll('_',' ')+' · '+first.unit;
    const figure=html('figure'),caption=html('figcaption',title);figure.className='regional-chart';figure.append(caption,oneChart(values,title));fragment.append(figure);
  }
  return fragment;
}
