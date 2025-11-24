// script.js — Полная версия интерактивной доски
// Поддерживает: карандаш, ластик, текст, фигуры (rect, circle, arrow),
// перемещение объектов, слои (выбор/удаление/скрытие), экспорт в PNG,
// сохранение/загрузка через localStorage.

// --------- Инициализация канвы и переменных ----------
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

function fitCanvas() {
    // адаптация под DPR для чёткости
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight - document.getElementById('toolbar').offsetHeight;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fitCanvas();
window.addEventListener('resize', () => { fitCanvas(); redraw(); });

// инструменты и параметры
let tool = 'draw';
let drawColor = '#000000';
let drawSize = 4;
let eraseSize = 30;
let textSize = 22;
let textColor = '#0044ff';

// состояние
let items = []; // список объектов на доске (слои). Каждый item: {id, type, ...}
let isDrawing = false;
let currentStroke = null;
let selectedId = null; // id выбранного объекта
let showLayers = false;

// вспомогательные: генерация id
function uid() { return 'id' + Math.random().toString(36).slice(2, 9); }

// --------- API, вызываемое кнопками из HTML ----------
function setTool(t) {
    tool = t;
    selectedId = null;
    redraw();
}
function updateDrawSize() { drawSize = parseInt(document.getElementById('drawSize').value); }
function updateDrawColor() { drawColor = document.getElementById('drawColor').value; }
function updateEraseSize() { eraseSize = parseInt(document.getElementById('eraseSize').value); }
function updateTextSize() { textSize = parseInt(document.getElementById('textSize').value); }
function updateTextColor() { textColor = document.getElementById('textColor').value; }

// --------- Слой: добавить объект в массив и обновить интерфейс ----------
function pushItem(item) {
    items.push(item);
    renderLayers();
    redraw();
}

// --------- Обработка мыши: события на canvas ----------
let startX = 0, startY = 0;

canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    startX = x; startY = y;

    // Если выбран инструмент перемещения — проверим попадание в объект
    if (tool === 'move') {
        const hit = hitTest(x, y);
        if (hit) {
            selectedId = hit.id;
            items.forEach(it => it._dragOffset = undefined);
            // запомним смещение курсора внутри объекта для плавного перетаскивания
            if (!items.find(it => it.id === selectedId)._dragOffset) {
                const it = items.find(it => it.id === selectedId);
                it._dragOffset = { x: x - (it.x || 0), y: y - (it.y || 0) };
            }
            canvas.style.cursor = 'grabbing';
            redraw();
            return;
        }
    }

    // Текст - добавление: клик — ввод текста
    if (tool === 'text') {
        const text = prompt('Введите текст:');
        if (!text) return;
        const item = {
            id: uid(),
            type: 'text',
            value: text,
            x, y,
            size: textSize,
            color: textColor,
            visible: true
        };
        pushItem(item);
        return;
    }

    // Для прямоугольника/круга/стрелки начинаем создание фигуры
    if (['rect', 'circle', 'arrow'].includes(tool)) {
        isDrawing = true;
        const item = {
            id: uid(),
            type: tool,
            x, y,
            x2: x, y2: y,
            stroke: drawColor,
            strokeWidth: drawSize,
            visible: true
        };
        pushItem(item);
        currentStroke = item;
        return;
    }

    // Рисование и ластик
    if (tool === 'draw' || tool === 'erase') {
        isDrawing = true;
        currentStroke = {
            id: uid(),
            type: tool === 'draw' ? 'stroke' : 'erase',
            color: tool === 'draw' ? drawColor : '#ffffff',
            strokeWidth: tool === 'draw' ? drawSize : eraseSize,
            points: [{ x, y }],
            visible: true
        };
        pushItem(currentStroke);
        return;
    }

    // По умолчанию — попробовать выбрать объект на слое (выделение)
    const hit = hitTest(x, y);
    if (hit) {
        selectedId = hit.id;
        renderLayers();
        redraw();
    } else {
        selectedId = null;
        renderLayers();
        redraw();
    }

});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isDrawing && currentStroke) {
        if (currentStroke.type === 'stroke' || currentStroke.type === 'erase') {
            currentStroke.points.push({ x, y });
        } else if (['rect', 'circle', 'arrow'].includes(currentStroke.type)) {
            currentStroke.x2 = x; currentStroke.y2 = y;
        }
        redraw();
    } else if (selectedId && tool === 'move' && e.buttons) {
        // перетаскивание выбранного объекта
        const it = items.find(i => i.id === selectedId);
        if (!it) return;
        // для штрихов/erase не поддерживаем перетаскивание
        if (it.type === 'text' || it.type === 'rect' || it.type === 'circle' || it.type === 'arrow') {
            if (!it._dragOffset) it._dragOffset = { x: x - it.x, y: y - it.y };
            it.x = x - it._dragOffset.x;
            it.y = y - it._dragOffset.y;
            // для стрелки/rect/circle возможно нужно сдвинуть вторую точку тоже
            if (it.type === 'arrow') {
                // смещаем x2,y2 аналогично сохранённому смещению
                it.x2 = it.x2 ? it.x2 + (x - startX) : it.x2;
                it.y2 = it.y2 ? it.y2 + (y - startY) : it.y2;
            }
            redraw();
        }
    }
});

canvas.addEventListener('mouseup', (e) => {
    isDrawing = false;
    currentStroke = null;
    canvas.style.cursor = 'default';
    // очистим временные оффсеты
    items.forEach(it => { if (it._dragOffset) delete it._dragOffset; });
});

// --------- Функция хит-тест для объектов (выбор объектов по позиции) ----------
function hitTest(x, y) {
    // проходим в обратном порядке (верхний слой — последний)
    for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (!it.visible) continue;
        if (it.type === 'text') {
            ctx.font = it.size + 'px Arial';
            const w = ctx.measureText(it.value).width;
            const h = it.size;
            if (x >= it.x && x <= it.x + w && y <= it.y && y >= it.y - h) return it;
        } else if (it.type === 'rect') {
            const x1 = Math.min(it.x, it.x2), x2 = Math.max(it.x, it.x2);
            const y1 = Math.min(it.y, it.y2), y2 = Math.max(it.y, it.y2);
            if (x >= x1 && x <= x2 && y >= y1 && y <= y2) return it;
        } else if (it.type === 'circle') {
            const cx = (it.x + it.x2) / 2, cy = (it.y + it.y2) / 2;
            const rx = Math.abs(it.x2 - it.x) / 2, ry = Math.abs(it.y2 - it.y) / 2;
            // приблизительно: используем rx
            const dist = Math.hypot(x - cx, y - cy);
            if (dist <= Math.max(rx, ry)) return it;
        } else if (it.type === 'arrow') {
            // простая проверка: по линии с некоторым допуском
            const x1 = it.x, y1 = it.y, x2 = it.x2 || it.x, y2 = it.y2 || it.y;
            const dist = pointToSegmentDistance({ x, y }, { x: x1, y: y1 }, { x: x2, y: y2 });
            if (dist <= 8) return it;
        } else if (it.type === 'stroke' || it.type === 'erase') {
            // Не поддерживаем выбор линий для упрощения
            continue;
        }
    }
    return null;
}

function pointToSegmentDistance(p, a, b) {
    // расстояние от точки p до отрезка ab
    const vx = b.x - a.x, vy = b.y - a.y;
    const wx = p.x - a.x, wy = p.y - a.y;
    const c1 = vx * wx + vy * wy;
    if (c1 <= 0) return Math.hypot(p.x - a.x, p.y - a.y);
    const c2 = vx * vx + vy * vy;
    if (c2 <= c1) return Math.hypot(p.x - b.x, p.y - b.y);
    const t = c1 / c2;
    const projx = a.x + t * vx, projy = a.y + t * vy;
    return Math.hypot(p.x - projx, p.y - projy);
}

// --------- Рисование всей доски (перерисовка) ----------
function redraw() {
    // очистка
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // рисуем все объекты по порядку
    for (let it of items) {
        if (!it.visible) continue;
        if (it.type === 'stroke' || it.type === 'erase') {
            ctx.beginPath();
            ctx.lineWidth = it.strokeWidth || it.strokeWidth === 0 ? it.strokeWidth : it.strokeWidth || it.strokeWidth === undefined ? it.strokeWidth : it.strokeWidth;
            ctx.lineWidth = it.strokeWidth || it.strokeWidth === undefined ? it.strokeWidth : it.strokeWidth;
            ctx.lineWidth = it.strokeWidth || it.strokeWidth === undefined ? it.strokeWidth : it.strokeWidth || it.strokeWidth;
            ctx.lineWidth = it.strokeWidth || it.strokeWidth === undefined ? it.strokeWidth : it.strokeWidth || it.strokeWidth || (it.type === 'erase' ? eraseSize : drawSize);
            ctx.lineJoin = ctx.lineCap = 'round';
            ctx.strokeStyle = it.color || (it.type === 'erase' ? '#fff' : '#000');
            for (let i = 0; i < it.points.length; i++) {
                const p = it.points[i];
                if (i === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
        } else if (it.type === 'text') {
            ctx.font = it.size + 'px Arial';
            ctx.fillStyle = it.color || '#000';
            ctx.fillText(it.value, it.x, it.y);
            // рамка при выделении
            if (selectedId === it.id) {
                const w = ctx.measureText(it.value).width;
                const h = it.size;
                ctx.strokeStyle = '#ff8800';
                ctx.lineWidth = 1;
                ctx.strokeRect(it.x - 4, it.y - it.size - 4, w + 8, it.size + 8);
            }
        } else if (it.type === 'rect') {
            ctx.beginPath();
            ctx.lineWidth = it.strokeWidth || drawSize;
            ctx.strokeStyle = it.stroke || '#000';
            const x1 = it.x, y1 = it.y, x2 = it.x2 || it.x, y2 = it.y2 || it.y;
            ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
            if (selectedId === it.id) {
                ctx.strokeStyle = '#ff8800';
                ctx.lineWidth = 1;
                ctx.strokeRect(Math.min(x1, x2) - 4, Math.min(y1, y2) - 4, Math.abs(x2 - x1) + 8, Math.abs(y2 - y1) + 8);
            }
        } else if (it.type === 'circle') {
            ctx.beginPath();
            ctx.lineWidth = it.strokeWidth || drawSize;
            ctx.strokeStyle = it.stroke || '#000';
            const cx = (it.x + it.x2) / 2 || it.x;
            const cy = (it.y + it.y2) / 2 || it.y;
            const rx = Math.abs((it.x2 || it.x) - it.x) / 2 || 0;
            const ry = Math.abs((it.y2 || it.y) - it.y) / 2 || 0;
            const r = Math.max(rx, ry) || 0;
            ctx.ellipse(cx, cy, r, r, 0, 0, Math.PI * 2);
            ctx.stroke();
            if (selectedId === it.id) {
                ctx.strokeStyle = '#ff8800';
                ctx.lineWidth = 1;
                ctx.strokeRect(cx - r - 4, cy - r - 4, r * 2 + 8, r * 2 + 8);
            }
        } else if (it.type === 'arrow') {
            ctx.beginPath();
            ctx.lineWidth = it.strokeWidth || drawSize;
            ctx.strokeStyle = it.stroke || '#000';
            const x1 = it.x, y1 = it.y, x2 = it.x2 || it.x, y2 = it.y2 || it.y;
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            // стрелка наконечник
            const ang = Math.atan2(y2 - y1, x2 - x1);
            const len = 10 + (it.strokeWidth || drawSize);
            ctx.beginPath();
            ctx.moveTo(x2, y2);
            ctx.lineTo(x2 - len * Math.cos(ang - Math.PI / 8), y2 - len * Math.sin(ang - Math.PI / 8));
            ctx.lineTo(x2 - len * Math.cos(ang + Math.PI / 8), y2 - len * Math.sin(ang + Math.PI / 8));
            ctx.closePath();
            ctx.fillStyle = it.stroke || '#000';
            ctx.fill();
            if (selectedId === it.id) {
                ctx.strokeStyle = '#ff8800';
                ctx.lineWidth = 1;
                ctx.strokeRect(Math.min(x1, x2) - 4, Math.min(y1, y2) - 4, Math.abs(x2 - x1) + 8, Math.abs(y2 - y1) + 8);
            }
        }
    }
}

// --------- Панель слоёв ----------
function renderLayers() {
    const panel = document.getElementById('layersPanel');
    panel.innerHTML = '';
    for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        const div = document.createElement('div');
        div.className = 'layer-item';
        const title = document.createElement('div');
        title.textContent = `${it.type}${it.type === 'text' ? ': ' + (it.value.length > 10 ? it.value.slice(0, 10) + '...' : it.value) : ''}`;
        const controls = document.createElement('div');
        // visibility toggle
        const visBtn = document.createElement('button'); visBtn.textContent = it.visible ? '👁' : '🚫';
        visBtn.onclick = (ev) => { ev.stopPropagation(); it.visible = !it.visible; renderLayers(); redraw(); };
        // select
        const selBtn = document.createElement('button'); selBtn.textContent = selectedId === it.id ? '✓' : '☐';
        selBtn.onclick = (ev) => { ev.stopPropagation(); selectedId = it.id; renderLayers(); redraw(); };
        // delete
        const delBtn = document.createElement('button'); delBtn.textContent = '🗑';
        delBtn.onclick = (ev) => { ev.stopPropagation(); items = items.filter(x => x.id !== it.id); selectedId = null; renderLayers(); redraw(); };
        controls.appendChild(visBtn); controls.appendChild(selBtn); controls.appendChild(delBtn);

        div.appendChild(title); div.appendChild(controls);
        // клик по слою — выбрать
        div.onclick = () => { selectedId = it.id; renderLayers(); redraw(); };
        panel.appendChild(div);
    }
}

// показать/скрыть панель
function toggleLayers() {
    showLayers = !showLayers;
    document.getElementById('layersPanel').style.display = showLayers ? 'block' : 'none';
    if (showLayers) renderLayers();
}

// --------- Экспорт в PNG ----------
function exportPNG() {
    // временно увеличим рендеринг для лучшего качества
    const dataURL = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = 'board.png';
    a.click();
}

// --------- Сохранение/Загрузка (localStorage по ID) ----------
function saveBoard() {
    const id = prompt('ID для сохранения: (напр. myboard1)');
    if (!id) return;
    localStorage.setItem('board_' + id, JSON.stringify(items));
    alert('Сохранено как board_' + id);
}

function loadBoard() {
    const id = prompt('ID доски для загрузки:');
    if (!id) return;
    const data = localStorage.getItem('board_' + id);
    if (!data) return alert('Нет такой доски');
    try {
        items = JSON.parse(data);
        selectedId = null;
        renderLayers();
        redraw();
    } catch (e) {
        alert('Ошибка чтения данных: ' + e.message);
    }
}

// --------- Очистка доски ----------
function clearBoard() {
    if (!confirm('Очистить доску?')) return;
    items = [];
    selectedId = null;
    renderLayers();
    redraw();
}

// --------- Утилиты: создание фигур с начальными координатами (при выборе инструмента) ----------
/* Дополнительно: чтобы при рисовании rect/circle/arrow
   пользователь мог кликнуть -> тянуть -> отпустить. Для простоты
   уже реализовано добавление в mousedown и обновление в mousemove.
*/

// --------- Инициализация UI: присвоение обработчиков и начальное состояние ----------
document.getElementById('drawSize').value = drawSize;
document.getElementById('eraseSize').value = eraseSize;
document.getElementById('textSize').value = textSize;
document.getElementById('drawColor').value = drawColor;
document.getElementById('textColor').value = textColor;

renderLayers();
redraw();

// --------- Поддержка клавиш (удаление выбранного) ----------
document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) {
            items = items.filter(i => i.id !== selectedId);
            selectedId = null;
            renderLayers();
            redraw();
        }
    }
});
