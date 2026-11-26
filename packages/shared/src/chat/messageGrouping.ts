import type { GroupedMessage, Message, MessageGroupPosition } from '../types';

export const MESSAGE_GROUP_WINDOW_MS = 3 * 60 * 1000; // 3 minutes

const SHORT_MONTHS_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Formats a message timestamp into a compact consumer-messenger date separator:
 * "Hari ini", "Kemarin", or "12 Nov" (with year if different year).
 */
export function formatDateSeparator(iso: string, now: Date = new Date()): string {
  const target = new Date(iso);
  const diffDays = Math.round(
    (startOfLocalDay(now) - startOfLocalDay(target)) / 86_400_000
  );

  if (diffDays === 0) return 'Hari ini';
  if (diffDays === 1) return 'Kemarin';

  const day = target.getDate();
  const month = SHORT_MONTHS_ID[target.getMonth()] ?? '';
  if (target.getFullYear() === now.getFullYear()) {
    return `${day} ${month}`;
  }
  return `${day} ${month} ${target.getFullYear()}`;
}

function canGroupTogether(prev: Message, curr: Message): boolean {
  if (prev.senderId !== curr.senderId) return false;
  if (prev.type === 'hangout_card' || curr.type === 'hangout_card') return false;
  const prevDate = new Date(prev.createdAt);
  const currDate = new Date(curr.createdAt);
  if (!isSameLocalDay(prevDate, currDate)) return false;
  return currDate.getTime() - prevDate.getTime() <= MESSAGE_GROUP_WINDOW_MS;
}

/**
 * Groups consecutive messages from the same sender within 3 minutes
 * and inserts day separators ("Hari ini", "Kemarin", "12 Nov").
 */
export function groupMessages(
  messages: Message[],
  now: Date = new Date()
): GroupedMessage[] {
  return messages.map((message, index) => {
    const prev = index > 0 ? messages[index - 1] : null;
    const next = index < messages.length - 1 ? messages[index + 1] : null;

    const currDate = new Date(message.createdAt);
    const prevDate = prev ? new Date(prev.createdAt) : null;

    const showDateSeparator = !prevDate || !isSameLocalDay(prevDate, currDate);
    const groupedWithPrev = Boolean(prev && canGroupTogether(prev, message));
    const groupedWithNext = Boolean(next && canGroupTogether(message, next));

    let groupPosition: MessageGroupPosition = 'single';
    if (!groupedWithPrev && groupedWithNext) {
      groupPosition = 'first';
    } else if (groupedWithPrev && groupedWithNext) {
      groupPosition = 'middle';
    } else if (groupedWithPrev && !groupedWithNext) {
      groupPosition = 'last';
    }

    return {
      message,
      groupPosition,
      showDateSeparator,
      dateLabel: showDateSeparator ? formatDateSeparator(message.createdAt, now) : undefined,
      showAvatar: !groupedWithPrev,
      showSenderName: !groupedWithPrev,
    };
  });
}
