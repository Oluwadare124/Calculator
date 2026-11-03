const expressionEl = document.getElementById('expression');
const resultEl = document.getElementById('result');
const statusEl = document.getElementById('statusText');
const memoryIndicator = document.getElementById('memoryIndicator');
const keypad = document.getElementById('keypad');
const historyDrawer = document.getElementById('historyDrawer');
const historyList = document.getElementById('historyList');
const scrim = document.getElementById('scrim');

let expression = '';
let answer = 0;
let memory = 0;
let angleMode = 'DEG';
let history = [];
let justCalculated = false;

const pretty = value => String(value).replaceAll('*', '×').replaceAll('/', '÷');
const formatNumber = value => {
  if (!Number.isFinite(value)) throw new Error('Math error');
  if (Math.abs(value) < 1e-12) value = 0;
  return Number(value.toPrecision(12)).toString();
};

function updateDisplay() {
  expressionEl.textContent = pretty(expression);
  resultEl.textContent = expression ? preview() : '0';
  memoryIndicator.hidden = memory === 0;
}
function preview() {
  try {
    if (!expression || /[+\-×÷^.(]$/.test(expression)) return '…';
    return formatNumber(evaluate(expression));
  } catch { return '…'; }
}
function insert(value) {
  if (justCalculated && /[0-9πe.(]/.test(value[0] || '') && !['!','%','^2'].includes(value)) expression = '';
  justCalculated = false;
  if (value === '±') {
    if (!expression) expression = '−';
    else expression = `−(${expression})`;
  } else if (value === '1/') {
    expression = `1/(${expression || 'Ans'})`;
  } else if (value === '×10^') {
    expression += '×10^';
  } else {
    expression += value;
  }
  updateDisplay();
}
function clearAll() { expression = ''; justCalculated = false; statusEl.textContent = 'READY'; updateDisplay(); }
function deleteLast() { expression = expression.slice(0, -1); justCalculated = false; updateDisplay(); }

function factorial(n) {
  if (!Number.isInteger(n) || n < 0 || n > 170) throw new Error('Factorial requires an integer from 0 to 170');
  let out = 1;
  for (let i = 2; i <= n; i++) out *= i;
  return out;
}

function tokenize(input) {
  const s = input.replaceAll('×','*').replaceAll('÷','/').replaceAll('−','-').replaceAll('√','sqrt');
  const tokens = [];
  let i = 0;
  const names = ['asin','acos','atan','sqrt','sin','cos','tan','log','ln'];
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const raw = s.slice(i,j);
      if ((raw.match(/\./g) || []).length > 1 || raw === '.') throw new Error('Invalid number');
      if (s[j] === 'e' && /[0-9]/.test(s[j+1] || '')) {
        j++;
        if (/[+-]/.test(s[j] || '')) j++;
        while (/[0-9]/.test(s[j] || '')) j++;
      }
      tokens.push({type:'number', value:Number(s.slice(i,j))}); i=j; continue;
    }
    if (/[a-z]/i.test(c)) {
      let name = names.find(n => s.slice(i,i+n.length).toLowerCase() === n);
      if (!name && s.slice(i,i+3) === 'Ans') name = 'Ans';
      if (!name && s[i] === 'e') name = 'e';
      if (!name) throw new Error('Unknown function');
      tokens.push({type:'name', value:name}); i += name.length; continue;
    }
    if (c === 'π') { tokens.push({type:'number',value:Math.PI}); i++; continue; }
    if ('+-*/^()%!'.includes(c)) { tokens.push({type:c, value:c}); i++; continue; }
    throw new Error('Invalid character');
  }
  // Implicit multiplication: 2π, 2(3), (2)(3), 2sin(30)
  const expanded = [];
  for (let k=0;k<tokens.length;k++) {
    const a=tokens[k], b=tokens[k+1];
    expanded.push(a);
    const ends = a.type==='number' || a.type===')' || a.type==='!' || a.type==='%';
    const starts = b && (b.type==='number' || b.type==='name' || b.type==='(');
    if (ends && starts) expanded.push({type:'*',value:'*'});
  }
  return expanded;
}

function evaluate(input) {
  const t = tokenize(input);
  let pos = 0;
  const peek = () => t[pos];
  const take = () => t[pos++];
  const angle = x => angleMode === 'DEG' ? x * Math.PI / 180 : x;
  const fromAngle = x => angleMode === 'DEG' ? x * 180 / Math.PI : x;

  function primary() {
    const token = take();
    if (!token) throw new Error('Incomplete expression');
    if (token.type === 'number') return token.value;
    if (token.type === '(') {
      const v = addSub();
      if (!peek() || take().type !== ')') throw new Error('Missing closing bracket');
      return v;
    }
    if (token.type === 'name') {
      if (token.value === 'Ans') return answer;
      if (token.value === 'e') return Math.E;
      if (!peek() || take().type !== '(') throw new Error('Function needs parentheses');
      const x = addSub();
      if (!peek() || take().type !== ')') throw new Error('Missing closing bracket');
      switch(token.value) {
        case 'sin': return Math.sin(angle(x));
        case 'cos': return Math.cos(angle(x));
        case 'tan': return Math.tan(angle(x));
        case 'asin': return fromAngle(Math.asin(x));
        case 'acos': return fromAngle(Math.acos(x));
        case 'atan': return fromAngle(Math.atan(x));
        case 'sqrt': if (x < 0) throw new Error('Invalid square root'); return Math.sqrt(x);
        case 'log': if (x <= 0) throw new Error('Log input must be positive'); return Math.log10(x);
        case 'ln': if (x <= 0) throw new Error('Ln input must be positive'); return Math.log(x);
      }
    }
    if (token.type === '-') return -unary();
    if (token.type === '+') return unary();
    throw new Error('Unexpected input');
  }
  function postfix() {
    let v = primary();
    while (peek() && (peek().type === '!' || peek().type === '%')) {
      const op = take().type;
      v = op === '!' ? factorial(v) : v / 100;
    }
    return v;
  }
  function power() {
    let v = postfix();
    if (peek() && peek().type === '^') { take(); v = Math.pow(v, unary()); }
    return v;
  }
  function unary() { return power(); }
  function multiply() {
    let v = unary();
    while (peek() && ['*','/'].includes(peek().type)) {
      const op=take().type, rhs=unary();
      v = op==='*' ? v*rhs : v/rhs;
    }
    return v;
  }
  function addSub() {
    let v=multiply();
    while (peek() && ['+','-'].includes(peek().type)) {
      const op=take().type, rhs=multiply();
      v=op==='+' ? v+rhs : v-rhs;
    }
    return v;
  }
  const value=addSub();
  if (pos !== t.length) throw new Error('Check your expression');
  return value;
}

function calculate() {
  if (!expression) return;
  try {
    const value = evaluate(expression);
    const formatted = formatNumber(value);
    history.unshift({expression, result:formatted});
    history = history.slice(0,50);
    answer = value;
    expression = formatted;
    justCalculated = true;
    statusEl.textContent = 'CALCULATED';
    renderHistory();
    updateDisplay();
    resultEl.textContent = formatted;
  } catch (error) {
    statusEl.textContent = error.message || 'ERROR';
    resultEl.textContent = 'Error';
  }
}
function renderHistory() {
  historyList.innerHTML = '';
  if (!history.length) {
    historyList.innerHTML = '<p class="empty-history">Your calculations will appear here.</p>';
    return;
  }
  history.forEach(item => {
    const row = document.createElement('div');
    row.className = 'history-item';
    const exp = document.createElement('div'); exp.className='history-expression'; exp.textContent=pretty(item.expression);
    const res = document.createElement('div'); res.className='history-result'; res.textContent='= '+item.result;
    row.append(exp,res);
    row.addEventListener('click',()=>{ expression=item.expression; justCalculated=false; closeHistory(); updateDisplay(); });
    historyList.append(row);
  });
}
function openHistory() { historyDrawer.classList.add('open'); scrim.classList.add('show'); historyDrawer.setAttribute('aria-hidden','false'); }
function closeHistory() { historyDrawer.classList.remove('open'); scrim.classList.remove('show'); historyDrawer.setAttribute('aria-hidden','true'); }

keypad.addEventListener('click', e => {
  const key=e.target.closest('button'); if(!key) return;
  if(key.dataset.action==='clear') clearAll();
  else if(key.dataset.action==='delete') deleteLast();
  else if(key.dataset.action==='calculate') calculate();
  else if(key.dataset.value) insert(key.dataset.value);
});
document.querySelector('.utility-row').addEventListener('click', e => {
  const action=e.target.closest('button')?.dataset.action; if(!action) return;
  if(action==='history') openHistory();
  if(action==='memory-clear') { memory=0; memoryIndicator.hidden=true; }
  if(action==='memory-recall') insert(formatNumber(memory));
  if(action==='memory-add' || action==='memory-subtract') {
    try { const v=expression ? evaluate(expression) : answer; memory += action==='memory-add' ? v : -v; memoryIndicator.hidden=memory===0; }
    catch { statusEl.textContent='Invalid memory value'; }
  }
});
document.getElementById('angleMode').addEventListener('click', e => {
  angleMode=angleMode==='DEG'?'RAD':'DEG'; e.currentTarget.textContent=angleMode;
});
document.getElementById('themeToggle').addEventListener('click',()=>document.body.classList.toggle('light'));
document.getElementById('closeHistory').addEventListener('click',closeHistory);
document.getElementById('clearHistory').addEventListener('click',()=>{history=[];renderHistory();});
scrim.addEventListener('click',closeHistory);

document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^[0-9.]$/.test(e.key)) insert(e.key);
  else if (e.key === '+') insert('+');
  else if (e.key === '-') insert('−');
  else if (e.key === '*') insert('×');
  else if (e.key === '/') { e.preventDefault(); insert('÷'); }
  else if (e.key === '^') insert('^');
  else if (e.key === '(' || e.key === ')') insert(e.key);
  else if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); calculate(); }
  else if (e.key === 'Backspace') deleteLast();
  else if (e.key === 'Escape') { closeHistory(); clearAll(); }
  else if (e.key === '%') insert('%');
});
updateDisplay();
