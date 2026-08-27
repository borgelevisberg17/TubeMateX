const base = process.env.TEST_BASE_URL || 'http://localhost:3016';
const cases = [
  {name:'Brasil português notícias',params:'country=BR&language=por&category=news',country:'BR',language:'por',category:'news'},
  {name:'Portugal português entretenimento',params:'country=PT&language=por&category=entertainment',country:'PT',language:'por',category:'entertainment'},
  {name:'Estados Unidos inglês documentário',params:'country=US&language=eng&category=documentary',country:'US',language:'eng',category:'documentary'},
  {name:'Coreia coreano entretenimento',params:'country=KR&language=kor&category=entertainment',country:'KR',language:'kor',category:'entertainment'},
  {name:'Japão japonês animação',params:'country=JP&language=jpn&category=animation',country:'JP',language:'jpn',category:'animation'}
];
(async()=>{const report=[];for(const item of cases){const response=await fetch(`${base}/api/iptv/channels?limit=10&${item.params}`);const payload=await response.json();const valid=response.ok&&payload.results.every(channel=>channel.country===item.country&&channel.languages.includes(item.language)&&channel.categories.includes(item.category)&&channel.title&&channel.url&&!channel.availabilityLabel?.toLowerCase().includes('dmca'));report.push({name:item.name,status:response.status,count:payload.results.length,sample:payload.results.slice(0,3).map(channel=>channel.title),valid});}console.log(JSON.stringify(report,null,2));if(report.some(item=>!item.valid))process.exit(1)})().catch(error=>{console.error('IPTV_FILTERS_FAIL',error.message);process.exit(1)});
