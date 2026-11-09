import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, View, Text, Pressable, StyleSheet, StatusBar } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------- Настройки ----------
const STORAGE_KEY = 'period-days-v1'; // здесь хранятся отмеченные дни на телефоне
const DEFAULT_PERIOD_LENGTH = 5; // сколько дней рисуем в прогнозе

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];
const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

// ---------- Работа с датами ----------
// Даты храним строками 'ГГГГ-ММ-ДД' по местному времени (без toISOString,
// чтобы не ловить сдвиг дня из-за часовых поясов).
const pad = (n) => String(n).padStart(2, '0');
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const diffDays = (a, b) => Math.round((a - b) / 86400000);
const formatDate = (d) => `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;

// ---------- Прогноз ----------
// Начало цикла = отмеченный день, перед которым предыдущий день не отмечен.
function getCycleStarts(keys) {
  const set = new Set(keys);
  return [...keys]
    .sort()
    .filter((k) => !set.has(toKey(addDays(fromKey(k), -1))))
    .map(fromKey);
}

// Простой прогноз по последним циклам. Возвращает диапазон, а не одну точную дату.
function predictNext(keys) {
  const starts = getCycleStarts(keys);
  const gaps = [];
  for (let i = 1; i < starts.length; i++) {
    const gap = diffDays(starts[i], starts[i - 1]);
    if (gap >= 15 && gap <= 60) gaps.push(gap); // отсекаем явные ошибки ввода
  }
  if (gaps.length === 0) return null;
  const recent = gaps.slice(-6);
  const avg = Math.round(recent.reduce((a, b) => a + b, 0) / recent.length);
  const last = starts[starts.length - 1];
  return {
    next: addDays(last, avg),
    earliest: addDays(last, Math.min(...recent)),
    latest: addDays(last, Math.max(...recent)),
    avg,
  };
}

// ---------- Экран ----------
export default function App() {
  const [marked, setMarked] = useState([]); // массив ключей 'ГГГГ-ММ-ДД'
  const [loaded, setLoaded] = useState(false);
  const [month, setMonth] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });

  // Загрузка сохранённых данных при старте
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setMarked(JSON.parse(raw));
      } catch (e) {
        console.warn('Не удалось загрузить данные', e);
      }
      setLoaded(true);
    })();
  }, []);

  // Сохранение при каждом изменении (только после загрузки, чтобы не затереть данные)
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(marked)).catch((e) =>
      console.warn('Не удалось сохранить данные', e)
    );
  }, [marked, loaded]);

  const markedSet = useMemo(() => new Set(marked), [marked]);
  const prediction = useMemo(() => predictNext(marked), [marked]);

  const predictedSet = useMemo(() => {
    const s = new Set();
    if (!prediction) return s;
    for (let i = 0; i < DEFAULT_PERIOD_LENGTH; i++) {
      s.add(toKey(addDays(prediction.next, i)));
    }
    return s;
  }, [prediction]);

  const toggleDay = (key) => {
    setMarked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const shiftMonth = (delta) =>
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  // Клетки месяца: пустые в начале (неделя с понедельника) + дни
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const list = Array(offset).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      list.push(new Date(month.getFullYear(), month.getMonth(), d));
    }
    return list;
  }, [month]);

  const todayKey = toKey(new Date());

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Pressable onPress={() => shiftMonth(-1)} hitSlop={12}>
          <Text style={styles.nav}>‹</Text>
        </Pressable>
        <Text style={styles.title}>
          {MONTHS[month.getMonth()]} {month.getFullYear()}
        </Text>
        <Pressable onPress={() => shiftMonth(1)} hitSlop={12}>
          <Text style={styles.nav}>›</Text>
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={styles.weekday}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((date, i) => {
          if (!date) return <View key={`e${i}`} style={styles.cell} />;
          const key = toKey(date);
          const isMarked = markedSet.has(key);
          const isPredicted = !isMarked && predictedSet.has(key);
          const isToday = key === todayKey;
          return (
            <Pressable key={key} style={styles.cell} onPress={() => toggleDay(key)}>
              <View
                style={[
                  styles.day,
                  isMarked && styles.dayMarked,
                  isPredicted && styles.dayPredicted,
                  isToday && !isMarked && styles.dayToday,
                ]}
              >
                <Text style={[styles.dayText, isMarked && styles.dayTextMarked]}>
                  {date.getDate()}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.summary}>
        {prediction ? (
          <>
            <Text style={styles.summaryTitle}>
              Следующие месячные примерно {formatDate(prediction.next)}
            </Text>
            <Text style={styles.summaryText}>
              Возможный диапазон: {formatDate(prediction.earliest)} – {formatDate(prediction.latest)}.
              Средний цикл: {prediction.avg} дн.
            </Text>
          </>
        ) : (
          <Text style={styles.summaryText}>
            Нажимайте на дни, чтобы отметить месячные. Прогноз появится, когда отмечены начала
            хотя бы двух циклов.
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

// ---------- Стили ----------
const INK = '#2E2140';
const BERRY = '#B3365B';
const PAPER = '#FBFAFC';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAPER, paddingTop: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  nav: { fontSize: 32, color: INK, paddingHorizontal: 8 },
  title: { fontSize: 22, fontWeight: '600', color: INK },
  weekRow: { flexDirection: 'row', paddingHorizontal: 12 },
  weekday: { width: '14.2857%', textAlign: 'center', color: '#8A7F96', fontSize: 13, paddingBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12 },
  cell: { width: '14.2857%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  day: {
    width: '84%',
    aspectRatio: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  dayMarked: { backgroundColor: BERRY },
  dayPredicted: { borderColor: BERRY, borderStyle: 'dashed' },
  dayToday: { borderColor: INK },
  dayText: { fontSize: 16, color: INK },
  dayTextMarked: { color: '#FFFFFF', fontWeight: '600' },
  summary: { padding: 24, gap: 6 },
  summaryTitle: { fontSize: 17, fontWeight: '600', color: INK },
  summaryText: { fontSize: 15, lineHeight: 22, color: '#5B4F69' },
});