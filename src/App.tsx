import { useState, useEffect, useCallback } from 'react';
import Papa from 'papaparse';

const SHEET_ID = '12RhQZkMXbDLoUeYg-H35win6TwdxrpYu7Tt5-xoL8aw';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`;
const TIMEZONE = 'Europe/Moscow';
const UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

interface Workshop {
  name: string;
  leader: string;
  date: string;
  startTime: string;
  calendarLink: string;
  zoomLink: string;
  workshopId: string;
  dateTime: Date;
}

interface Countdown {
  days: number;
  hours: number;
}

function parseDate(dateStr: string, timeStr: string): Date | null {
  try {
    const [day, month, year] = dateStr.split('.').map(Number);
    const [hours, minutes] = timeStr.split(':').map(Number);
    
    if (!day || !month || !year || isNaN(hours) || isNaN(minutes)) return null;
    
    // Создаём дату в МСК (UTC+3)
    const utcTime = Date.UTC(year, month - 1, day, hours - 3, minutes, 0, 0);
    return new Date(utcTime);
  } catch {
    return null;
  }
}

function formatDateTime(date: Date): string {
  const formatter = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIMEZONE,
  });
  
  const parts = formatter.formatToParts(date);
  const day = parts.find(p => p.type === 'day')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const year = parts.find(p => p.type === 'year')?.value;
  const hour = parts.find(p => p.type === 'hour')?.value;
  const minute = parts.find(p => p.type === 'minute')?.value;
  
  return `${day} ${month} ${year} г. в ${hour}:${minute}`;
}

function getCountdown(targetDate: Date): Countdown {
  const now = new Date();
  const diff = targetDate.getTime() - now.getTime();
  
  if (diff <= 0) return { days: 0, hours: 0 };
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  return { days, hours };
}

function getPluralForm(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const n1 = abs % 10;
  
  if (abs > 10 && abs < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}

function App() {
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workshop, setWorkshop] = useState<Workshop | null>(null);
  const [countdown, setCountdown] = useState<Countdown>({ days: 0, hours: 0 });
  const [topic, setTopic] = useState<string>('');

  useEffect(() => {
    document.documentElement.className = darkMode ? 'dark' : 'light';
  }, [darkMode]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const topicParam = params.get('topic') || '';
    setTopic(topicParam);
  }, []);

  const fetchWorkshops = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWorkshop(null);

    try {
      const response = await fetch(CSV_URL);
      
      if (!response.ok) {
        throw new Error('Не удалось загрузить данные');
      }
      
      const csvText = await response.text();
      
      const result = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
      });

      if (result.errors.length > 0 && result.data.length === 0) {
        throw new Error('Ошибка парсинга данных');
      }

      const now = new Date();
      const workshops: Workshop[] = [];

      for (const row of result.data as Record<string, string>[]) {
        const dateStr = row['Дата'] || '';
        const timeStr = row['Время начала'] || '';
        const dateTime = parseDate(dateStr, timeStr);
        
        if (!dateTime) continue;
        
        // Фильтр: дата и время >= текущее время
        if (dateTime.getTime() < now.getTime()) continue;

        const name = row['Название'] || '';
        const workshopId = row['workshop_id'] || '';

        // Фильтрация по topic
        if (topic) {
          const topicLower = topic.toLowerCase();
          if (
            !name.toLowerCase().includes(topicLower) &&
            !workshopId.toLowerCase().includes(topicLower)
          ) {
            continue;
          }
        }

        workshops.push({
          name,
          leader: row['Ведущий'] || '',
          date: dateStr,
          startTime: timeStr,
          calendarLink: row['Добавить в Яндекс.Календарь'] || '',
          zoomLink: row['Подключиться в Zoom'] || '',
          workshopId,
          dateTime,
        });
      }

      // Сортировка по дате и времени (возрастание)
      workshops.sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());

      // Берём первый ближайший воркшоп
      if (workshops.length > 0) {
        setWorkshop(workshops[0]);
        setCountdown(getCountdown(workshops[0].dateTime));
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Произошла неизвестная ошибка');
    } finally {
      setLoading(false);
    }
  }, [topic]);

  useEffect(() => {
    fetchWorkshops();
  }, [fetchWorkshops]);

  // Обновление обратного отсчёта каждую секунду
  useEffect(() => {
    if (!workshop) return;

    const interval = setInterval(() => {
      setCountdown(getCountdown(workshop.dateTime));
    }, 1000);

    return () => clearInterval(interval);
  }, [workshop]);

  const toggleTheme = () => {
    setDarkMode(prev => !prev);
  };

  // Рендер состояния загрузки
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 transition-colors duration-300">
        <button
          onClick={toggleTheme}
          className="fixed top-4 right-4 z-50 w-10 h-10 rounded-full bg-white dark:bg-slate-700 shadow-lg flex items-center justify-center hover:scale-110 transition-transform"
          aria-label="Переключить тему"
        >
          <i className={`fas ${darkMode ? 'fa-sun text-yellow-400' : 'fa-moon text-slate-600'} text-lg`} />
        </button>
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-slate-500 dark:text-slate-400 text-lg">Загрузка...</p>
        </div>
      </div>
    );
  }

  // Рендер состояния ошибки
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 transition-colors duration-300 p-4">
        <button
          onClick={toggleTheme}
          className="fixed top-4 right-4 z-50 w-10 h-10 rounded-full bg-white dark:bg-slate-700 shadow-lg flex items-center justify-center hover:scale-110 transition-transform"
          aria-label="Переключить тему"
        >
          <i className={`fas ${darkMode ? 'fa-sun text-yellow-400' : 'fa-moon text-slate-600'} text-lg`} />
        </button>
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <i className="fas fa-exclamation-triangle text-red-500 text-2xl" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Ошибка загрузки</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-6">{error}</p>
          <button
            onClick={fetchWorkshops}
            className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-medium hover:from-blue-600 hover:to-blue-700 transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
          >
            <i className="fas fa-redo mr-2" />
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }

  // Рендер заглушки (нет воркшопа)
  if (!workshop) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 transition-colors duration-300 p-4">
        <button
          onClick={toggleTheme}
          className="fixed top-4 right-4 z-50 w-10 h-10 rounded-full bg-white dark:bg-slate-700 shadow-lg flex items-center justify-center hover:scale-110 transition-transform"
          aria-label="Переключить тему"
        >
          <i className={`fas ${darkMode ? 'fa-sun text-yellow-400' : 'fa-moon text-slate-600'} text-lg`} />
        </button>
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
            <i className="fas fa-calendar-times text-slate-400 dark:text-slate-500 text-3xl" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
            {topic ? `Тема: «${topic}»` : 'Нет активных воркшопов'}
          </h2>
          <p className="text-slate-500 dark:text-slate-400">Следующий воркшоп скоро появится</p>
        </div>
      </div>
    );
  }

  // Рендер карточки воркшопа
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 transition-colors duration-300 p-4">
      {/* Переключатель темы */}
      <button
        onClick={toggleTheme}
        className="fixed top-4 right-4 z-50 w-10 h-10 rounded-full bg-white dark:bg-slate-700 shadow-lg flex items-center justify-center hover:scale-110 transition-transform"
        aria-label="Переключить тему"
      >
        <i className={`fas ${darkMode ? 'fa-sun text-yellow-400' : 'fa-moon text-slate-600'} text-lg`} />
      </button>

      {/* Карточка воркшопа */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 md:p-8 max-w-lg w-full">
        {/* Бейдж */}
        <div className="flex items-center gap-2 mb-5">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-sm font-medium">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse-dot" />
            Ближайший воркшоп
          </span>
        </div>

        {/* Название */}
        <h1 className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-white mb-4 leading-tight">
          {workshop.name}
        </h1>

        {/* Ведущий */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <i className="fas fa-user text-blue-500 text-sm" />
          </div>
          <span className="text-slate-600 dark:text-slate-300 text-base">{workshop.leader}</span>
        </div>

        {/* Дата и время */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
            <i className="fas fa-clock text-purple-500 text-sm" />
          </div>
          <div>
            <p className="text-slate-700 dark:text-slate-200 font-medium">
              {formatDateTime(workshop.dateTime)}
            </p>
            <p className="text-slate-400 dark:text-slate-500 text-sm">МСК (UTC+3)</p>
          </div>
        </div>

        {/* Обратный отсчёт */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-700 dark:to-slate-700 rounded-xl p-4 mb-6">
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-2 text-center">До начала осталось</p>
          <div className="flex items-center justify-center gap-4">
            <div className="text-center">
              <span className="text-lg md:text-xl font-bold text-blue-600 dark:text-blue-400">{countdown.days}</span>
              <p className="text-xs text-slate-500 dark:text-slate-400">{getPluralForm(countdown.days, ['день', 'дня', 'дней'])}</p>
            </div>
            <span className="text-slate-300 dark:text-slate-600 text-xl">•</span>
            <div className="text-center">
              <span className="text-lg md:text-xl font-bold text-indigo-600 dark:text-indigo-400">{countdown.hours}</span>
              <p className="text-xs text-slate-500 dark:text-slate-400">{getPluralForm(countdown.hours, ['час', 'часа', 'часов'])}</p>
            </div>
          </div>
        </div>

        {/* Кнопки */}
        <div className="flex flex-col gap-3">
          {workshop.calendarLink && (
            <a
              href={workshop.calendarLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-medium hover:from-blue-600 hover:to-blue-700 transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 text-base"
            >
              <i className="fas fa-calendar-plus" />
              Добавить в Яндекс.Календарь
            </a>
          )}
          {workshop.zoomLink && (
            <a
              href={workshop.zoomLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-xl font-medium hover:from-indigo-600 hover:to-indigo-700 transition-all shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 text-base"
            >
              <i className="fas fa-video" />
              Подключиться в Zoom
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
