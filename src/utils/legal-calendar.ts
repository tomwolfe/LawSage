/**
 * Legal Calendar & Deadline Math
 * 
 * "Deadlines are math, not prose."
 * 
 * Provides formal logic for legal deadline calculations, accounting for:
 * 1. Weekends (Saturdays and Sundays)
 * 2. Court Holidays (Federal and State-specific)
 * 3. The "Monday Morning Rule" (Moving deadlines to next court day)
 */

export type Jurisdiction = 'Federal' | 'California' | 'New York' | 'Texas' | 'Florida' | 'Pennsylvania' | string;

/**
 * Common Federal Holidays (Fixed and Relative)
 */
export const FEDERAL_HOLIDAYS = [
  { name: 'New Year's Day', month: 0, day: 1 },
  { name: 'Martin Luther King Jr. Day', month: 0, week: 3, dayOfWeek: 1 }, // 3rd Monday in Jan
  { name: 'Presidents' Day', month: 1, week: 3, dayOfWeek: 1 },         // 3rd Monday in Feb
  { name: 'Memorial Day', month: 4, last: true, dayOfWeek: 1 },          // Last Monday in May
  { name: 'Juneteenth', month: 5, day: 19 },
  { name: 'Independence Day', month: 6, day: 4 },
  { name: 'Labor Day', month: 8, week: 1, dayOfWeek: 1 },                // 1st Monday in Sep
  { name: 'Indigenous Peoples' Day', month: 9, week: 2, dayOfWeek: 1 }, // 2nd Monday in Oct
  { name: 'Veterans Day', month: 10, day: 11 },
  { name: 'Thanksgiving Day', month: 10, week: 4, dayOfWeek: 4 },        // 4th Thursday in Nov
  { name: 'Christmas Day', month: 11, day: 25 },
];

/**
 * State-specific Holidays
 */
export const STATE_HOLIDAYS: Record<string, Array<{ name: string; month: number; day?: number; week?: number; dayOfWeek?: number; last?: boolean }>> = {
  'California': [
    { name: 'Cesar Chavez Day', month: 2, day: 31 },
    { name: 'Day after Thanksgiving', month: 10, week: 4, dayOfWeek: 5 },
  ],
  'Texas': [
    { name: 'Confederate Heroes Day', month: 0, day: 19 },
    { name: 'Texas Independence Day', month: 2, day: 2 },
    { name: 'San Jacinto Day', month: 3, day: 21 },
    { name: 'Emancipation Day', month: 5, day: 19 },
    { name: 'Lyndon Baines Johnson Day', month: 7, day: 27 },
  ],
  // Add more as needed
};

/**
 * Check if a date is a weekend
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}

/**
 * Calculate the date for a relative holiday (e.g., "3rd Monday of January")
 */
function getRelativeHolidayDate(year: number, month: number, week: number, dayOfWeek: number, last?: boolean): Date {
  if (last) {
    // Start at end of month and work backwards
    const date = new Date(year, month + 1, 0);
    while (date.getDay() !== dayOfWeek) {
      date.setDate(date.getDate() - 1);
    }
    return date;
  }

  // Start at beginning of month
  const date = new Date(year, month, 1);
  
  // Move to first occurrence of dayOfWeek
  while (date.getDay() !== dayOfWeek) {
    date.setDate(date.getDate() + 1);
  }
  
  // Move to the N-th occurrence
  date.setDate(date.getDate() + (week - 1) * 7);
  return date;
}

/**
 * Check if a date is a legal holiday in the given jurisdiction
 */
export function isHoliday(date: Date, jurisdiction: Jurisdiction = 'Federal'): boolean {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  // Check Federal Holidays
  for (const h of FEDERAL_HOLIDAYS) {
    let holidayDate: Date;
    if (h.day !== undefined) {
      holidayDate = new Date(year, h.month, h.day);
    } else {
      holidayDate = getRelativeHolidayDate(year, h.month, h.week!, h.dayOfWeek!, h.last);
    }

    // Observed rule: If holiday falls on Saturday, observed on Friday. If Sunday, observed on Monday.
    if (holidayDate.getTime() === new Date(year, month, day).getTime()) return true;
    
    // Check observed dates
    if (holidayDate.getDay() === 6) { // Saturday -> Friday
      const observed = new Date(holidayDate);
      observed.setDate(observed.getDate() - 1);
      if (observed.getTime() === new Date(year, month, day).getTime()) return true;
    } else if (holidayDate.getDay() === 0) { // Sunday -> Monday
      const observed = new Date(holidayDate);
      observed.setDate(observed.getDate() + 1);
      if (observed.getTime() === new Date(year, month, day).getTime()) return true;
    }
  }

  // Check State Holidays
  const stateHols = STATE_HOLIDAYS[jurisdiction] || [];
  for (const h of stateHols) {
    let holidayDate: Date;
    if (h.day !== undefined) {
      holidayDate = new Date(year, h.month, h.day);
    } else {
      holidayDate = getRelativeHolidayDate(year, h.month, h.week!, h.dayOfWeek!, h.last);
    }

    if (holidayDate.getTime() === new Date(year, month, day).getTime()) return true;
  }

  return false;
}

/**
 * Check if a date is a "Court Day" (neither weekend nor holiday)
 */
export function isCourtDay(date: Date, jurisdiction: Jurisdiction = 'Federal'): boolean {
  return !isWeekend(date) && !isHoliday(date, jurisdiction);
}

/**
 * Get the next available court day
 */
export function getNextCourtDay(date: Date, jurisdiction: Jurisdiction = 'Federal'): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  
  while (!isCourtDay(next, jurisdiction)) {
    next.setDate(next.getDate() + 1);
  }
  
  return next;
}

/**
 * Formal Logic Deadline Calculator
 * 
 * If a deadline falls on a non-court day, it is moved to the NEXT court day.
 */
export function calculateLegalDeadline(
  startDate: Date, 
  days: number, 
  jurisdiction: Jurisdiction = 'Federal',
  options: { businessDaysOnly?: boolean } = {}
): Date {
  const deadline = new Date(startDate);
  
  if (options.businessDaysOnly) {
    let courtDaysCount = 0;
    while (courtDaysCount < days) {
      deadline.setDate(deadline.getDate() + 1);
      if (isCourtDay(deadline, jurisdiction)) {
        courtDaysCount++;
      }
    }
  } else {
    deadline.setDate(deadline.getDate() + days);
    
    // If it lands on a weekend or holiday, move to next court day
    if (!isCourtDay(deadline, jurisdiction)) {
      while (!isCourtDay(deadline, jurisdiction)) {
        deadline.setDate(deadline.getDate() + 1);
      }
    }
  }
  
  return deadline;
}
