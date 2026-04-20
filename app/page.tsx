"use client";

import { useEffect, useRef, useState } from 'react';

type Step = 'subjects' | 'uploads' | 'chat' | 'timetable' | 'dashboard' | 'custom' | 'data'

interface Subject {
  id: number;
  name: string;
  strength: number | null;
}

type StudyPreferences = {
  workingDays: string[];
  workingHoursByDay: Record<string, { start: string; end: string }>;
  slotDurationMinutes: number;
  maxTopicsPerSlot: number;
};

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DEFAULT_DAY_RANGE = { start: '08:00', end: '12:00' };

const parseTimeToMinutes = (value: string) => {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return hours * 60 + minutes;
};

const formatMinutesTo12Hour = (totalMinutes: number) => {
  const bounded = Math.max(0, Math.min(totalMinutes, 24 * 60 - 1));
  const hours24 = Math.floor(bounded / 60);
  const minutes = bounded % 60;
  const suffix = hours24 >= 12 ? 'pm' : 'am';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${suffix}`;
};

const getSlotStartsForDay = (
  day: string,
  preferences: StudyPreferences,
) => {
  const range = preferences.workingHoursByDay[day] || DEFAULT_DAY_RANGE;
  const start = parseTimeToMinutes(range.start);
  const end = parseTimeToMinutes(range.end);
  const slotDuration = Math.max(15, preferences.slotDurationMinutes || 60);

  if (start === null || end === null || end <= start) return [];

  const slotCount = Math.floor((end - start) / slotDuration);
  if (slotCount <= 0) return [];

  return Array.from({ length: slotCount }, (_, index) => start + index * slotDuration);
};

const formatTimeRangeFromStart = (start: number, slotDurationMinutes: number) => {
  const safeDuration = Math.max(15, slotDurationMinutes || 60);
  const slotEnd = start + safeDuration;
  return `${formatMinutesTo12Hour(start)} - ${formatMinutesTo12Hour(slotEnd)}`;
};

export default function StudyPlannerApp() {
  const [currentStep, setCurrentStep] = useState<Step>('subjects');

useEffect(() => {
  const saved = localStorage.getItem('step') as Step;
  if (saved) setCurrentStep(saved);
}, []);

useEffect(() => {
  localStorage.setItem('step', currentStep);
}, [currentStep]);
  
  // Pre-populated subjects based on typical academic schedules
  const [subjects, setSubjects] = useState<Subject[]>([
  ]);
  const [studyPreferences, setStudyPreferences] = useState<StudyPreferences>({
    workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    workingHoursByDay: {
      Mon: { ...DEFAULT_DAY_RANGE },
      Tue: { ...DEFAULT_DAY_RANGE },
      Wed: { ...DEFAULT_DAY_RANGE },
      Thu: { ...DEFAULT_DAY_RANGE },
      Fri: { ...DEFAULT_DAY_RANGE },
    },
    slotDurationMinutes: 60,
    maxTopicsPerSlot: 3,
  });

  useEffect(() => {
    const savedSubjects = localStorage.getItem('subjects');
    if (!savedSubjects) return;

    try {
      const parsed = JSON.parse(savedSubjects);

      if (!Array.isArray(parsed)) return;

      const normalizedSubjects: Subject[] = parsed
        .map((item) => ({
          id: typeof item?.id === 'number' ? item.id : Date.now(),
          name: typeof item?.name === 'string' ? item.name : '',
          strength:
            typeof item?.strength === 'number' && item.strength >= 0 && item.strength <= 4
              ? item.strength
              : null,
        }))
        .filter((item) => item.name.trim() !== '');

      if (normalizedSubjects.length > 0) {
        setSubjects(normalizedSubjects);
      }
    } catch (error) {
      console.error('Failed to parse subjects from localStorage:', error);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('subjects', JSON.stringify(subjects));
  }, [subjects]);

  useEffect(() => {
    const savedStudyPreferences = localStorage.getItem('studyPreferences');
    if (!savedStudyPreferences) return;

    try {
      const parsed = JSON.parse(savedStudyPreferences);

      const normalizedDays = Array.isArray(parsed?.workingDays)
        ? parsed.workingDays.filter(
            (day: unknown): day is string =>
              typeof day === 'string' && WEEK_DAYS.includes(day),
          )
        : [];

      const parsedHoursByDay =
        parsed?.workingHoursByDay && typeof parsed.workingHoursByDay === 'object'
          ? parsed.workingHoursByDay
          : {};

      const normalizedHoursByDay = WEEK_DAYS.reduce<Record<string, { start: string; end: string }>>(
        (acc, day) => {
          const entry = (parsedHoursByDay as Record<string, unknown>)[day] as
            | { start?: unknown; end?: unknown }
            | undefined;

          const start = typeof entry?.start === 'string' ? entry.start : DEFAULT_DAY_RANGE.start;
          const end = typeof entry?.end === 'string' ? entry.end : DEFAULT_DAY_RANGE.end;

          acc[day] = {
            start,
            end,
          };

          return acc;
        },
        {},
      );

      const normalizedSlotDuration =
        typeof parsed?.slotDurationMinutes === 'number' && parsed.slotDurationMinutes >= 15
          ? Math.floor(parsed.slotDurationMinutes)
          : 60;

      const normalizedMaxTopics =
        typeof parsed?.maxTopicsPerSlot === 'number' && parsed.maxTopicsPerSlot >= 1
          ? Math.floor(parsed.maxTopicsPerSlot)
          : 3;

      setStudyPreferences({
        workingDays: normalizedDays.length > 0 ? normalizedDays : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        workingHoursByDay: normalizedHoursByDay,
        slotDurationMinutes: normalizedSlotDuration,
        maxTopicsPerSlot: normalizedMaxTopics,
      });
    } catch (error) {
      console.error('Failed to parse studyPreferences from localStorage:', error);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('studyPreferences', JSON.stringify(studyPreferences));
  }, [studyPreferences]);

  const toggleWorkingDay = (day: string) => {
    setStudyPreferences((prev) => {
      const isSelected = prev.workingDays.includes(day);

      if (isSelected) {
        // Keep at least one working day selected.
        if (prev.workingDays.length === 1) return prev;

        return {
          ...prev,
          workingDays: prev.workingDays.filter((item) => item !== day),
        };
      }

      return {
        ...prev,
        workingDays: [...prev.workingDays, day],
        workingHoursByDay: {
          ...prev.workingHoursByDay,
          [day]: prev.workingHoursByDay[day] || { ...DEFAULT_DAY_RANGE },
        },
      };
    });
  };

  const updateWorkingHoursByDay = (
    day: string,
    field: 'start' | 'end',
    value: string,
  ) => {
    setStudyPreferences((prev) => ({
      ...prev,
      workingHoursByDay: {
        ...prev.workingHoursByDay,
        [day]: {
          ...(prev.workingHoursByDay[day] || { ...DEFAULT_DAY_RANGE }),
          [field]: value,
        },
      },
    }));
  };

  const [newSubjectName, setNewSubjectName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const strengthColors = [
    'bg-red-500 hover:bg-red-600', 
    'bg-orange-400 hover:bg-orange-500', 
    'bg-yellow-400 hover:bg-yellow-500', 
    'bg-green-300 hover:bg-green-400', 
    'bg-green-500 hover:bg-green-600'
  ];

  const strengthNumbers = [1,2,3,4,5]




  // Top Navigation Bar (Consistent across screens)
  const renderHeader = () => (
    <header className="bg-green-800 p-4 flex justify-between items-center shadow-md">
      <div className="flex space-x-2">
        <button 
          onClick={() => setCurrentStep('dashboard')}
          className={`px-4 py-2 text-sm font-semibold hover:cursor-pointer rounded ${currentStep === 'dashboard' ? 'bg-white text-green-800' : 'bg-green-700 text-white hover:bg-green-600'}`}
        >
          My Timetables
        </button>
        <button 
          onClick={() => setCurrentStep('chat')}
          className={`px-4 py-2 text-sm font-semibold hover:cursor-pointer rounded ${currentStep === 'chat' ? 'bg-white text-green-800' : 'bg-green-700 text-white hover:bg-green-600'}`}
        >
          Ask our AI-bot
        </button>
        <button 
          onClick={() => setCurrentStep('subjects')}
          className={`px-4 py-2 text-sm font-semibold hover:cursor-pointer rounded ${currentStep === 'subjects' ? 'bg-white text-green-800' : 'bg-green-700 text-white hover:bg-green-600'}`}
        >
          Add and rate your subjects
        </button>

        <button 
          onClick={() => setCurrentStep('uploads')}
          className={`px-4 py-2 text-sm font-semibold hover:cursor-pointer rounded ${currentStep === 'uploads' ? 'bg-white text-green-800' : 'bg-green-700 text-white hover:bg-green-600'}`}
        >
          Upload your Handouts
        </button>

        <button 
          onClick={() => setCurrentStep('data')}
          className={`px-4 py-2 text-sm font-semibold hover:cursor-pointer rounded ${currentStep === 'data' ? 'bg-white text-green-800' : 'bg-green-700 text-white hover:bg-green-600'}`}
        >
          Your data
        </button>

        
      </div>
    </header>
  );

  // Screen 1: Subject Setup
  const renderSubjectsScreen = () => (
    <div className="max-w-3xl mx-auto mt-10 p-6 bg-white border rounded shadow">
      <div className="flex justify-between mb-6">
        <h2 className="text-xl font-medium text-gray-800 max-w-lg">
          Add your subjects and rate your weaknesses and strengths in each of them, to help our AI-bot get a better context.
        </h2>
        <div className='flex space-x-3'>
          <button onClick={() => setCurrentStep('uploads')} className="px-6 py-2 bg-black text-white rounded hover:bg-gray-800 hover:cursor-pointer">
          Upload Handouts
        </button>
        <button onClick= {()=>setIsAdding(true)}className='px-6 py-2 bg-green-500 text-white rounded hover:bg-green-800 hover:cursor-pointer'>
          +add a subject
        </button>
        </div>
        
      </div>
      {isAdding && (
        <div className="mt-4 flex space-x-2">
          <input
            type="text"
            value={newSubjectName}
            onChange={(e) => setNewSubjectName(e.target.value)}
            placeholder="Enter subject name"
            className="border p-2 rounded w-full text-black"
          />
          <button
            onClick={() => {
              if (newSubjectName.trim() === '') return;

              const newSubject = {
                id: subjects.length + 1,
                name: newSubjectName,
                strength: null
              };

              setSubjects([...subjects, newSubject]);
              setNewSubjectName('');
              setIsAdding(false);
            }}
            className="bg-blue-500 text-white px-4 rounded hover:cursor-pointer hover:bg-blue-700 active:bg-gray-600"
          >
            Add
          </button>
        </div>
      )}

      <div className="mt-8">
        <div className="mb-8 p-4 bg-gray-50 rounded border">
          <h3 className="text-lg text-gray-700 mb-3">Study Availability</h3>

          <p className="text-sm text-gray-600 mb-2">Choose working days (Sun to Sat):</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {WEEK_DAYS.map((day) => {
              const selected = studyPreferences.workingDays.includes(day);

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleWorkingDay(day)}
                  className={`px-3 py-1 rounded text-sm border ${
                    selected
                      ? 'bg-green-600 text-white border-green-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="space-y-3 mb-4">
            <p className="text-sm text-gray-600">Set working time for each selected day:</p>
            <div className="space-y-2">
              {WEEK_DAYS.filter((day) => studyPreferences.workingDays.includes(day)).map((day) => (
                <div key={day} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <span className="text-sm font-medium text-gray-700">{day}</span>
                  <label className="flex flex-col text-sm text-gray-700">
                    Start
                    <input
                      type="time"
                      value={studyPreferences.workingHoursByDay[day]?.start || DEFAULT_DAY_RANGE.start}
                      onChange={(e) => updateWorkingHoursByDay(day, 'start', e.target.value)}
                      className="mt-1 border p-2 rounded text-black"
                    />
                  </label>
                  <label className="flex flex-col text-sm text-gray-700">
                    End
                    <input
                      type="time"
                      value={studyPreferences.workingHoursByDay[day]?.end || DEFAULT_DAY_RANGE.end}
                      onChange={(e) => updateWorkingHoursByDay(day, 'end', e.target.value)}
                      className="mt-1 border p-2 rounded text-black"
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex flex-col text-sm text-gray-700">
              Slot Duration (minutes)
              <input
                type="number"
                min={15}
                step={15}
                value={studyPreferences.slotDurationMinutes}
                onChange={(e) =>
                  setStudyPreferences((prev) => ({
                    ...prev,
                    slotDurationMinutes: Number(e.target.value) || 15,
                  }))
                }
                className="mt-1 border p-2 rounded text-black"
              />
            </label>

            <label className="flex flex-col text-sm text-gray-700">
              Max Topics Per Slot
              <input
                type="number"
                min={1}
                max={10}
                value={studyPreferences.maxTopicsPerSlot}
                onChange={(e) =>
                  setStudyPreferences((prev) => ({
                    ...prev,
                    maxTopicsPerSlot: Number(e.target.value) || 1,
                  }))
                }
                className="mt-1 border p-2 rounded text-black"
              />
            </label>
          </div>
        </div>

        <h3 className="text-lg text-gray-600 border-b pb-2 mb-4">Current Courses:</h3>
        
        {subjects.map((subject, index) => (
          <div key={subject.id} className="mb-6 p-4 bg-gray-50 rounded">
            <p className="font-medium text-gray-700 mb-3">{index + 1}. {subject.name}</p>
            <div className="flex space-x-2">
              {strengthColors.map((colorClass, i) => (
                <button
                  key={i}
                  className={`w-12 h-8 rounded ${colorClass} ${subject.strength === i ? 'ring-4 ring-gray-400 ring-offset-1' : ''}`}
                  onClick={() => {
                    const newSubjects = [...subjects];
                    newSubjects[index].strength = i;
                    setSubjects(newSubjects);
                  }}
                >
                  <nav className='text-black'>{strengthNumbers[i]}</nav>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
    interface Handout {
      subjectId: number;
      fileName: string;
      mimeType: string;
      dataUrl: string;
    }
  const [handouts, setHandouts] = useState<Handout[]>([]);
  const [handoutStatus, setHandoutStatus] = useState<Record<number, string>>({});
  const SUPPORTED_HANDOUT_MIME_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  const isSupportedHandoutFile = (file: File) => {
    const lowerFileName = file.name.toLowerCase();
    return (
      SUPPORTED_HANDOUT_MIME_TYPES.includes(file.type) ||
      lowerFileName.endsWith('.pdf') ||
      lowerFileName.endsWith('.docx')
    );
  };

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });

  useEffect(() => {
    const savedHandouts = localStorage.getItem('handouts');
    if (!savedHandouts) return;

    try {
      const parsed = JSON.parse(savedHandouts);
      if (!Array.isArray(parsed)) return;

      const normalizedHandouts: Handout[] = parsed
        .map((item) => ({
          subjectId: typeof item?.subjectId === 'number' ? item.subjectId : -1,
          fileName: typeof item?.fileName === 'string' ? item.fileName : '',
          mimeType: typeof item?.mimeType === 'string' ? item.mimeType : 'application/pdf',
          dataUrl: typeof item?.dataUrl === 'string' ? item.dataUrl : '',
        }))
        .filter((item) => item.subjectId >= 0 && item.fileName && item.dataUrl);

      setHandouts(normalizedHandouts);
    } catch (error) {
      console.error('Failed to parse handouts from localStorage:', error);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('handouts', JSON.stringify(handouts));
  }, [handouts]);

  const handleFileUpload = async (subjectid: number, file: File | null) => {
  if (!file) return;

  if (!isSupportedHandoutFile(file)) {
    setHandoutStatus((prev) => ({
      ...prev,
      [subjectid]: 'Only PDF and DOCX files are supported.',
    }));
    return;
  }

  const existingHandout = handouts.find((h) => h.subjectId === subjectid);
  if (existingHandout) {
    setHandoutStatus((prev) => ({
      ...prev,
      [subjectid]: 'A handout already exists for this subject. Delete it first to upload a new one.',
    }));
    return;
  }

  try {
    const dataUrl = await fileToDataUrl(file);

    const newHandout: Handout = {
      subjectId: subjectid,
      fileName: file.name,
      mimeType:
        file.type ||
        (file.name.toLowerCase().endsWith('.docx')
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/pdf'),
      dataUrl,
    };

    setHandouts((prev) => [...prev, newHandout]);
    setHandoutStatus((prev) => ({ ...prev, [subjectid]: 'Handout saved successfully.' }));
  } catch (error) {
    console.error(error);
    setHandoutStatus((prev) => ({ ...prev, [subjectid]: 'Could not save this file.' }));
  }
};

const deleteHandout = (subjectId: number) => {
  setHandouts((prev) => prev.filter((h) => h.subjectId !== subjectId));
  setHandoutStatus((prev) => ({ ...prev, [subjectId]: 'Handout deleted.' }));
};

const getFileName = (subjectId: number) => {
  return handouts.find(h => h.subjectId === subjectId)?.fileName;
};

const getHandout = (subjectId: number) => {
  return handouts.find(h => h.subjectId === subjectId);
};
  // Screen 2: Uploads
  const renderUploadsScreen = () => (
    <div className="max-w-3xl mx-auto mt-10 p-6 bg-white border rounded shadow">
      <div className="flex justify-between items-center mb-6">
        <button onClick={() => setCurrentStep('subjects')} className="px-6 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
          Back
        </button>
        <button onClick={() => setCurrentStep('chat')} className="px-6 py-2 bg-black text-white rounded hover:bg-gray-800">
          Continue
        </button>
      </div>

      <h2 className="text-lg text-gray-700 mb-6">
        If you want to, you can upload course handouts of each of your courses.
      </h2>

      <div className="space-y-4 mt-8">
        {subjects.map((subject, index) => (
          <div key={subject.id}>
            <div className="flex justify-between items-center p-4 bg-gray-50 border rounded">
              <span className="font-medium text-gray-700">
                {index + 1}. {subject.name}
                <span className="text-xs text-green-600 ml-3">
                  {getFileName(subject.id) || ''}
                </span>
              </span>

              <div className="flex items-center">
                <label className="px-4 py-2 bg-gray-300 text-gray-700 text-sm font-medium rounded hover:bg-gray-400 cursor-pointer">
                  Upload
                  <input
                    type="file"
                    accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx"
                    className="hidden"
                    onChange={(e) =>
                      void handleFileUpload(subject.id, e.target.files?.[0] || null)
                    }
                  />
                </label>
                {getHandout(subject.id) && (
                  <button
                    onClick={() => deleteHandout(subject.id)}
                    className="ml-2 px-4 py-2 bg-red-500 text-white text-sm font-medium rounded hover:bg-red-600 cursor-pointer"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
            {handoutStatus[subject.id] && (
              <p className="text-xs text-gray-600 mt-2">{handoutStatus[subject.id]}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );


  type ChatTimetableCell = {
    subject: string;
    topic: string;
  };

  type TimetableViewConfig = {
    days: string[];
    rowSlotStarts: number[];
    slotDurationMinutes: number;
    daySlotStarts: Record<string, number[]>;
  };

  type SavedTimetable = {
    name: string;
    id: string;
    source: 'chat' | 'timetable-screen';
    createdAt: string;
    signature: string;
    timetable: ChatTimetableCell[][];
    viewConfig: TimetableViewConfig;
    finished: boolean;
  };

  type ConversationTurn = {
    role: 'user' | 'assistant';
    content: string;
  };

  interface Chats {
    chat_id : string;
    chat_name: string;
    messages: {
      id: string;
      role: 'user' | 'ai';
      message: string;
      type?: 'text' | 'timetable';
      timetable?: ChatTimetableCell[][];
      accepted?: boolean;
    }[];
  }

  const [chats, setChats] = useState<Chats[]>([]);
  const [savedTimetables, setSavedTimetables] = useState<SavedTimetable[]>([]);
  const [isViewingSavedTimetable, setIsViewingSavedTimetable] = useState(false);
  const [openedSavedViewConfig, setOpenedSavedViewConfig] = useState<TimetableViewConfig | null>(null);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sendTex, setSendTex] = useState('');

  const [isSending, setIsSending] = useState(false);
  const orderedWorkingDays = WEEK_DAYS.filter((day) => studyPreferences.workingDays.includes(day));
  const daySlotStarts = orderedWorkingDays.reduce<Record<string, number[]>>((acc, day) => {
    acc[day] = getSlotStartsForDay(day, studyPreferences);
    return acc;
  }, {});
  const allSlotStarts = Array.from(
    new Set(orderedWorkingDays.flatMap((day) => daySlotStarts[day] || [])),
  ).sort((a, b) => a - b);
  const fallbackStart = parseTimeToMinutes(DEFAULT_DAY_RANGE.start) ?? 8 * 60;
  const rowSlotStarts = allSlotStarts.length > 0 ? allSlotStarts : [fallbackStart];
  const timeRowLabels = rowSlotStarts.map((start) =>
    formatTimeRangeFromStart(start, studyPreferences.slotDurationMinutes),
  );
  const maxTimeSlots = rowSlotStarts.length;

  const currentViewConfig: TimetableViewConfig = {
    days: [...orderedWorkingDays],
    rowSlotStarts: [...rowSlotStarts],
    slotDurationMinutes: studyPreferences.slotDurationMinutes,
    daySlotStarts: Object.fromEntries(
      orderedWorkingDays.map((day) => [day, [...(daySlotStarts[day] || [])]]),
    ),
  };

  const defaultViewConfigFromShape = (
    timetableRows: ChatTimetableCell[][],
  ): TimetableViewConfig => {
    const fallbackStart = parseTimeToMinutes(DEFAULT_DAY_RANGE.start) ?? 8 * 60;
    const rows = Math.max(1, timetableRows.length || 1);
    const cols = Math.max(1, timetableRows[0]?.length || 1);
    const days = WEEK_DAYS.slice(0, cols);
    const slotDurationMinutes = 60;
    const rowStarts = Array.from({ length: rows }, (_, index) => fallbackStart + index * slotDurationMinutes);

    return {
      days,
      rowSlotStarts: rowStarts,
      slotDurationMinutes,
      daySlotStarts: Object.fromEntries(days.map((day) => [day, [...rowStarts]])),
    };
  };

  const normalizeViewConfig = (
    maybeConfig: unknown,
    timetableRows: ChatTimetableCell[][],
  ): TimetableViewConfig => {
    const fallback = defaultViewConfigFromShape(timetableRows);
    if (!maybeConfig || typeof maybeConfig !== 'object') return fallback;

    const record = maybeConfig as {
      days?: unknown;
      rowSlotStarts?: unknown;
      slotDurationMinutes?: unknown;
      daySlotStarts?: unknown;
    };

    const days = Array.isArray(record.days)
      ? record.days.filter((day): day is string => typeof day === 'string' && WEEK_DAYS.includes(day))
      : [];

    const rowSlotStarts = Array.isArray(record.rowSlotStarts)
      ? record.rowSlotStarts.filter((value): value is number => typeof value === 'number')
      : [];

    const slotDurationMinutes =
      typeof record.slotDurationMinutes === 'number' && record.slotDurationMinutes >= 15
        ? record.slotDurationMinutes
        : fallback.slotDurationMinutes;

    const parsedDaySlotStarts =
      record.daySlotStarts && typeof record.daySlotStarts === 'object'
        ? (record.daySlotStarts as Record<string, unknown>)
        : {};

    const safeDays = days.length > 0 ? days : fallback.days;
    const safeRowStarts = rowSlotStarts.length > 0 ? rowSlotStarts : fallback.rowSlotStarts;

    const daySlotStartsNormalized: Record<string, number[]> = Object.fromEntries(
      safeDays.map((day) => {
        const dayValues = parsedDaySlotStarts[day];
        const normalized = Array.isArray(dayValues)
          ? dayValues.filter((value): value is number => typeof value === 'number')
          : [];

        return [day, normalized.length > 0 ? normalized : [...safeRowStarts]];
      }),
    );

    return {
      days: safeDays,
      rowSlotStarts: safeRowStarts,
      slotDurationMinutes,
      daySlotStarts: daySlotStartsNormalized,
    };
  };

  const toChatTimetableCells = (rows: Cell[][]): ChatTimetableCell[][] =>
    rows.map((row) => row.map((cell) => ({ subject: cell.subject, topic: cell.topic })));

  const getTimetableSignature = (
    rows: ChatTimetableCell[][],
    viewConfig: TimetableViewConfig,
  ) =>
    JSON.stringify({
      timetable: rows.map((row) => row.map((cell) => ({ subject: cell.subject, topic: cell.topic }))),
      viewConfig: {
        days: viewConfig.days,
        rowSlotStarts: viewConfig.rowSlotStarts,
        slotDurationMinutes: viewConfig.slotDurationMinutes,
        daySlotStarts: viewConfig.daySlotStarts,
      },
    });

  useEffect(() => {
    const saved = localStorage.getItem('acceptedTimetables');
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return;

      const normalized: SavedTimetable[] = parsed
        .map((item) => {
          const rows = Array.isArray(item?.timetable) ? item.timetable : [];
          const viewConfig = normalizeViewConfig(item?.viewConfig, rows);

          return {
            name: typeof item?.name === 'string' ? item.name : 'new_tt',
            id: typeof item?.id === 'string' ? item.id : `${Date.now()}-${Math.random()}`,
            source: (item?.source === 'chat' ? 'chat' : 'timetable-screen') as SavedTimetable['source'],
            createdAt: typeof item?.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
            signature:
              typeof item?.signature === 'string' && item.signature
                ? item.signature
                : getTimetableSignature(rows, viewConfig),
            timetable: rows,
            viewConfig,
            finished: false
          };
        })
        .filter((item) => item.signature && Array.isArray(item.timetable));

      setSavedTimetables(normalized);
    } catch (error) {
      console.error('Failed to parse accepted timetables:', error);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('acceptedTimetables', JSON.stringify(savedTimetables));
  }, [savedTimetables]);

  const saveAcceptedTimetable = (
    timetableRows: ChatTimetableCell[][],
    source: SavedTimetable['source'],
    viewConfig: TimetableViewConfig,
  ) => {
    const signature = getTimetableSignature(timetableRows, viewConfig);
    const alreadyExists = savedTimetables.some((item) => item.signature === signature);
    if (alreadyExists) return false;

    const record: SavedTimetable = {
      name: `new_tt_${savedTimetables.length + 1}`,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      source,
      createdAt: new Date().toISOString(),
      signature,
      timetable: timetableRows,
      viewConfig,
      finished: false
    };

    setSavedTimetables((prev) => [record, ...prev]);
    return true;
  };

  const handleAcceptChatTimetable = (
    chatId: string,
    messageId: string,
    timetableRows: ChatTimetableCell[][],
  ) => {
    saveAcceptedTimetable(timetableRows, 'chat', currentViewConfig);

    setChats((prevChats) =>
      prevChats.map((chat) =>
        chat.chat_id === chatId
          ? {
              ...chat,
              messages: chat.messages.map((message) =>
                message.id === messageId
                  ? { ...message, accepted: true }
                  : message,
              ),
            }
          : chat,
      ),
    );
  };

  const isCurrentTimetableAccepted = () => {
    const activeViewConfig = isViewingSavedTimetable && openedSavedViewConfig
      ? openedSavedViewConfig
      : currentViewConfig;
    const signature = getTimetableSignature(toChatTimetableCells(timetable), activeViewConfig);
    return savedTimetables.some((item) => item.signature === signature);
  };

  const handleAcceptTimetableScreen = () => {
    const activeViewConfig = isViewingSavedTimetable && openedSavedViewConfig
      ? openedSavedViewConfig
      : currentViewConfig;
    saveAcceptedTimetable(toChatTimetableCells(timetable), 'timetable-screen', activeViewConfig);
  };

  const openSavedTimetable = (saved: SavedTimetable) => {
    const reopened = saved.timetable.map((row) =>
      row.map((cell) => ({
        subject: cell.subject,
        topic: cell.topic,
        completed: false,
      })),
    );

    setTimetable(reopened);
    setIsViewingSavedTimetable(true);
    setOpenedSavedViewConfig(saved.viewConfig);
    setCurrentStep('timetable');
  };

  const deleteSavedTimetable = (savedId: string) => {
    setSavedTimetables((prev) => prev.filter((item) => item.id !== savedId));
  };

  const createNewChat = () => {
    const newChat: Chats = {
      chat_id: Date.now().toString(),
      chat_name: `chat new ${chats.length + 1}`,
      messages: []
    };

    setChats([newChat, ...chats]);
    setCurrentChatId(newChat.chat_id);
  };

  useEffect(()=>{
    if(currentStep === 'chat' && chats.length === 0){
      createNewChat();
    }
  },[currentStep, chats]);

  const handleSend = async(e: React.MouseEvent<HTMLButtonElement>) => {
    if (!input.trim() || !currentChatId) return;

    const latestTimetableFromChat = [...(currentChat?.messages || [])]
      .reverse()
      .find((message) => message.type === 'timetable' && message.timetable)?.timetable;

    const conversationForApi: ConversationTurn[] = (currentChat?.messages || [])
      .slice(-10)
      .map((message) => {
        const role: 'user' | 'assistant' = message.role === 'ai' ? 'assistant' : 'user';

        if (message.type === 'timetable' && message.timetable) {
          const timetableText = message.timetable
            .map((row, rowIndex) =>
              `Block ${rowIndex + 1}: ${row
                .map((cell) => `${cell.subject} - ${cell.topic}`)
                .join(' | ')}`
            )
            .join('\n');

          return {
            role,
            content: `${message.message}\n${timetableText}`,
          };
        }

        return {
          role,
          content: message.message,
        };
      });

    setSendTex(input);
    

    setChats(prevChats =>
      prevChats.map(chat =>
        chat.chat_id === currentChatId
          ? {
              ...chat,
              messages: [
                ...chat.messages,
                {
                  id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
                  role: 'user',
                  message: input,
                }
              ]
            }
          : chat
      )
    );

    setInput('');
    setIsSending(true);

    try {
        const res = await fetch('/api/timetable', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        prompt: input,
        subjects: subjects.map((subject) => ({
          id: subject.id,
          name: subject.name,
          score: subject.strength === null ? null : subject.strength + 1,
        })),
        studyPreferences,
        handouts,
        conversation: conversationForApi,
        previousTimetable: latestTimetableFromChat ||
          timetable.map((row) =>
            row.map((cell) => ({ subject: cell.subject, topic: cell.topic }))
          ),
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error || 'Chat request failed');
    }

    const generatedRows = Array.isArray(data?.timetable) ? data.timetable : [];

    if (
      generatedRows.length !== maxTimeSlots ||
      generatedRows.some((row: unknown) => !Array.isArray(row) || row.length !== orderedWorkingDays.length)
    ) {
      throw new Error('Timetable format was invalid. Please try again.');
    }

    const nextTimetable = generatedRows.map((row: Array<{ subject: string; topic: string }>) =>
      row.map((cell) => ({
        subject: cell.subject,
        topic: cell.topic,
        completed: false,
      }))
    );

    setTimetable(nextTimetable);

    const chatTimetable = nextTimetable.map((row: Cell[]) =>
      row.map((cell: Cell) => ({ subject: cell.subject, topic: cell.topic }))
    );

    // Add bot response
    setChats(prevChats =>
      prevChats.map(chat =>
        chat.chat_id === currentChatId
          ? {
              ...chat,
              messages: [
                ...chat.messages,
                {
                  id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
                  role: 'ai',
                  type: 'timetable',
                  message: 'Here is your generated timetable.',
                  timetable: chatTimetable,
                  accepted: false,
                }
              ]
            }
          : chat
      )
    );
    
    }catch (err) {
      console.error(err);
    }
    setIsSending(false);
  //  localStorage.setItem("curChats", JSON.stringify(chats))
  };

  const currentChat = chats.find(c => c.chat_id === currentChatId);
  const sendBtnRef = useRef<HTMLButtonElement>(null);



  // Screen 3: AI Chat Interface
  const renderChatScreen = () => (
    <div className="flex h-[calc(100vh-72px)]">
      {/* Sidebar */}
      <div className='w-64 h-150 overflow-y-auto'>
        <button 
          onClick={createNewChat}
          className="w-full py-2 bg-white border text-left px-4 rounded shadow-sm text-sm text-gray-700">
          + new chat
        </button>

        <div className="mt-4 space-y-1">
          {chats.length !== 0 && chats.map((chat) => (
            <button
              key={chat.chat_id}
              onClick={() => setCurrentChatId(chat.chat_id)}
              className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-300 rounded"
            >
              {chat.chat_name}
            </button>
          ))}
    </div>

    </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-white p-6 relative">
        <div className="flex-1 overflow-y-auto space-y-6 pb-20">
  {currentChat?.messages.map((msg, index) => (
  <div
    key={index}
    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
  >
    <div
      className={`p-4 rounded-lg shadow-sm ${
        msg.type === 'timetable' ? 'max-w-4xl w-full' : 'max-w-md'
      } ${
        msg.role === 'user'
          ? 'bg-gray-100 text-gray-800 rounded-tr-none'
          : 'bg-gray-800 text-white rounded-tl-none'
      }`}
    >
      {msg.role === 'user' && <p>{msg.message}</p>}

      {msg.role === 'ai' && msg.type !== 'timetable' && <p>{msg.message}</p>}

      {msg.type === 'timetable' && msg.timetable && (
        <div className="space-y-3">
          <p className="text-sm text-gray-100">{msg.message}</p>
          <div className="border border-gray-600 rounded-lg overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-gray-600 border-b border-gray-500">
                  <th className="p-3 border-r border-gray-500 font-medium">Time</th>
                  {orderedWorkingDays.map((day, dayIndex) => (
                    <th
                      key={`${msg.id}-${day}`}
                      className={`p-3 font-medium ${
                        dayIndex < orderedWorkingDays.length - 1
                          ? 'border-r border-gray-500'
                          : ''
                      }`}
                    >
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {msg.timetable.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-gray-600 last:border-0 text-white">
                    <td className="p-3 border-r border-gray-600 text-xs text-gray-300 align-top">
                      {timeRowLabels[rowIndex] || 'No slot'}
                    </td>
                    {orderedWorkingDays.map((day, colIndex) => {
                      const cell = row[colIndex];
                      const rowStart = rowSlotStarts[rowIndex];
                      const hasTimeRange = daySlotStarts[day]?.includes(rowStart);

                      if (!cell || !hasTimeRange) {
                        return (
                          <td key={`${msg.id}-${day}-${rowIndex}`} className="p-3 border-r border-gray-600 last:border-r-0 align-top">
                            <div className="w-full rounded text-xs p-2 min-h-20 bg-gray-800 text-gray-400">
                              No slot
                            </div>
                          </td>
                        );
                      }

                      return (
                      <td key={colIndex} className="p-3 border-r border-gray-600 last:border-r-0 align-top">
                        <div className="w-full rounded text-xs p-2 bg-gray-700 min-h-20">
                          <p className="font-medium leading-tight whitespace-normal break-words">{cell.subject}</p>
                          <p className="text-[10px] text-gray-200 leading-tight mt-1 whitespace-normal break-words">{cell.topic}</p>
                        </div>
                      </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(() => {
            const hasLaterUserMessage = Boolean(
              currentChat?.messages
                .slice(index + 1)
                .some((message) => message.role === 'user'),
            );
            const shouldDisableAccept = Boolean(msg.accepted) || hasLaterUserMessage;

            return (
              <button
                onClick={() => {
                  if (!currentChatId || !msg.timetable) return;
                  handleAcceptChatTimetable(currentChatId, msg.id, msg.timetable);
                }}
                disabled={shouldDisableAccept}
                className="px-3 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed"
              >
                {msg.accepted ? 'Accepted' : hasLaterUserMessage ? 'Accept (expired)' : 'Accept'}
              </button>
            );
          })()}
        </div>
      )}
      
    </div>
  </div>
))}
{isSending && (
  <div className="flex justify-start">
    <div className="bg-gray-800 text-white p-4 rounded-lg rounded-tl-none shadow-sm">
      <div className="flex space-x-1">
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
      </div>
    </div>
  </div>
)}
</div>

        {/* Input area */}
        <div className="absolute bottom-6 left-6 right-6">
          <div className="relative">
              <input type="text" value={input} onChange={(e)=>setInput(e.target.value)} 
              className="w-full border-2 bg-gray-200/70 backdrop-blur-md border-gray-300 text-black rounded-lg p-4 pr-12 shadow-sm focus:outline-none focus:border-green-500" placeholder="Type your message..." 
              onKeyDown={(e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendBtnRef.current?.click();
    }
  }}/>
              <button ref = {sendBtnRef} onClick = {(e) => handleSend(e)} className="absolute right-4 top-4 bg-black text-white p-1 rounded">
                <span className="block w-4 h-4 text-center leading-4">→</span>
              </button>
          </div>
        </div>
      </div>
    </div>
  );

  type Cell = {
      subject: string;
      topic: string;
      completed: boolean;
  };

  const [isGeneratingTimetable, setIsGeneratingTimetable] = useState(false);
  const [timetableError, setTimetableError] = useState('');

  const createFallbackTimetable = () => {
    const columns = Math.max(1, orderedWorkingDays.length);
    const rows = Math.max(1, maxTimeSlots);

    if (subjects.length === 0) {
      return Array.from({ length: rows }, (_, rowIndex) =>
        Array.from({ length: columns }, (_, colIndex) => ({
          subject: 'General Study',
          topic: 'Revision',
          completed: false,
        }))
      );
    }

    return Array.from({ length: rows }, (_, rowIndex) =>
        Array.from({ length: columns }, (_, colIndex) => {
          const sub = subjects[colIndex % subjects.length];
          return {
            subject: sub.name,
            topic: 'Revision',
            completed: false,
          };
        })
    );
  };
    
const [timetable, setTimetable] = useState<Cell[][]>(() => {
  return createFallbackTimetable();
});

const generateTimetableWithAI = async (userSuggestion?: string) => {
  if (subjects.length === 0) {
    setTimetableError('Please add at least one subject before generating a timetable.');
    return;
  }

  setIsGeneratingTimetable(true);
  setTimetableError('');

  try {
    const response = await fetch('/api/timetable', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subjects: subjects.map((subject) => ({
          id: subject.id,
          name: subject.name,
          score: subject.strength === null ? null : subject.strength + 1,
        })),
        studyPreferences,
        handouts,
        previousTimetable: timetable.map((row) =>
          row.map((cell) => ({ subject: cell.subject, topic: cell.topic }))
        ),
        ...(userSuggestion && userSuggestion.trim()
          ? { prompt: userSuggestion.trim() }
          : {}),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error || 'Failed to generate timetable.');
    }

    const generatedRows = Array.isArray(data?.timetable) ? data.timetable : [];

    if (
      generatedRows.length !== maxTimeSlots ||
      generatedRows.some((row: unknown) => !Array.isArray(row) || row.length !== orderedWorkingDays.length)
    ) {
      throw new Error('Timetable format was invalid. Please try again.');
    }

    setTimetable(
      generatedRows.map((row: Array<{ subject: string; topic: string }>) =>
        row.map((cell) => ({
          subject: cell.subject,
          topic: cell.topic,
          completed: false,
        }))
      )
    );

    setIsViewingSavedTimetable(false);
    setOpenedSavedViewConfig(null);
    setCurrentStep('timetable');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate timetable.';
    setTimetableError(message);
  } finally {
    setIsGeneratingTimetable(false);
  }
};

const handleRegenerateWithSuggestion = async () => {
  const suggestion = window.prompt(
    'What would you like to change in this timetable? (example: more focus on weak subjects, lighter Friday, exam-priority topics)',
    '',
  );

  if (suggestion === null) return;
  await generateTimetableWithAI(suggestion);
};

  const toggleCell = (rowIndex: number, colIndex: number) => {
    setTimetable(prev => {
    const updated = prev.map((row, i) =>
      row.map((cell, j) =>
        i === rowIndex && j === colIndex
          ? { ...cell, completed: !cell.completed }
          : cell
      )
    );

    localStorage.setItem("timetable", JSON.stringify(updated));

    return updated;
  });
};

const isPdfHandout = (handout: Handout) => {
  return handout.mimeType === 'application/pdf' || handout.fileName.toLowerCase().endsWith('.pdf');
};

const openHandout = (handout: Handout) => {
  if (isPdfHandout(handout)) {
    window.open(handout.dataUrl, '_blank');
    return;
  }

  const link = document.createElement('a');
  link.href = handout.dataUrl;
  link.download = handout.fileName;
  link.click();
};

  const currentData = () => (
    <div className="text-black max-w-xl mx-auto mt-6 p-5 bg-white border rounded-xl shadow">
    <h3 className="text-lg font-semibold mb-4">
      Your current profile
    </h3>

  <div className="space-y-3">
    {subjects.map((val, ind) => (
      <div
        key={ind}
        className="flex items-center justify-between bg-gray-50 px-4 py-3 rounded-lg hover:bg-gray-200"
      >
        {/* Left: Subject */}
        <div className="flex items-center space-x-3">
          <span className="text-sm text-gray-500">{ind + 1}.</span>
          <span className="font-medium">{val.name}</span>
        </div>

        {/* Right: Strength */}
        <div
          className={`px-3 py-1 text-xs font-semibold rounded-full ${
            val.strength !== null
              ? strengthColors[val.strength]
              : 'bg-gray-200 text-gray-600'
          }`}
        >
          {val.strength !== null
            ? `strength: ${val.strength + 1}`
            : 'Not rated'}
        </div>


      </div>
    ))}

  </div>

  <div className='text-black max-w-xl mx-auto mt-6 p-5 bg-white border rounded-xl shadow'>
    <span className='font-semibold'>Handouts with us</span>
    {subjects.map((val, ind) => {
  const handout = getHandout(val.id);

  return (
    <div
      key={ind}
      className="flex items-center justify-between bg-gray-50 px-4 py-3 rounded-lg hover:bg-gray-200"
    >
      {/* Left: Subject */}
      <div className="flex items-center space-x-3">
        <span className="text-sm text-gray-500">{ind + 1}.</span>
        <span className="font-medium">{val.name}</span>
      </div>

      {/* Right: File info */}
      <div className="flex items-center space-x-3">
        {handout ? (
          <>
            <span className="text-sm text-green-600 truncate max-w-[150px]">
              {handout.fileName}
            </span>
            <button
              onClick={() => openHandout(handout)}
              className="text-xs px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 hover:cursor-pointer active:bg-blue-900"
            >
              {isPdfHandout(handout) ? 'Open' : 'Download'}
            </button>
            <button
              onClick={() => deleteHandout(val.id)}
              className="text-xs px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 hover:cursor-pointer"
            >
              Delete
            </button>
          </>
        ) : (
          <span className="text-xs text-gray-400">
            No file
          </span>
        )}
      </div>
    </div>
  );
})}
  </div>
  <h2 className='p-3 font-bold'>Subjects and Topics Completed :</h2>
  <div className="flex items-center pt-3 space-x-2 space-y-4">
    <div className="space-y-4">
  {timetable.map((row, rowIndex) => (
    <div key={rowIndex} className="flex gap-3 flex-wrap">
      {row.map((cell, colIndex) => (
        cell.completed && (
          <div
            key={colIndex}
            className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 shadow-sm min-w-[120px]"
          >
            <p className="text-sm font-semibold text-green-800 truncate">
              {cell.subject}
            </p>
            <p className="text-xs text-green-600 truncate">
              {cell.topic}
            </p>
          </div>
        )
      ))}
    </div>
  ))}
</div>
  
</div>
</div>
  )

  const activeTimetableViewConfig = isViewingSavedTimetable && openedSavedViewConfig
    ? openedSavedViewConfig
    : currentViewConfig;
  const activeTimetableDays = activeTimetableViewConfig.days;
  const activeTimetableRowStarts = activeTimetableViewConfig.rowSlotStarts;
  const activeTimetableTimeLabels = activeTimetableRowStarts.map((start) =>
    formatTimeRangeFromStart(start, activeTimetableViewConfig.slotDurationMinutes),
  );


  const renderTimetableView = () => (
    <div className="max-w-4xl mx-auto mt-10 p-6 bg-white border rounded shadow">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-xl font-medium text-gray-800">We're glad you liked it!</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={handleAcceptTimetableScreen}
            disabled={isCurrentTimetableAccepted()}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed"
          >
            {isCurrentTimetableAccepted() ? 'Accepted' : 'Accept'}
          </button>
          {!isViewingSavedTimetable && (
            <button
              onClick={() => void handleRegenerateWithSuggestion()}
              disabled={isGeneratingTimetable}
              className="px-4 py-2 bg-green-700 text-white text-sm rounded hover:bg-green-800 disabled:bg-green-400 disabled:cursor-not-allowed"
            >
              {isGeneratingTimetable ? 'Generating...' : 'Regenerate with AI'}
            </button>
          )}
        </div>
      </div>
      <p className="text-gray-600 mb-6">You can track your progress by marking green when you finished a task</p>
      {timetableError && (
        <p className="text-sm text-red-600 mb-4">{timetableError}</p>
      )}
      
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-500 border-b">
                <th className="p-3 border-r font-medium">Time</th>
                {activeTimetableDays.map((day, dayIndex) => (
                  <th
                    key={`timetable-${day}`}
                    className={`p-3 font-medium ${dayIndex < activeTimetableDays.length - 1 ? 'border-r' : ''}`}
                  >
                    {day}
                  </th>
                ))}
            </tr>
          </thead>

            <tbody>
  {timetable.map((row, i) => (
    <tr key={i} className="border-b text-black last:border-0">
      
      <td className="p-3 border-r text-xs text-gray-500 align-top">
        {activeTimetableTimeLabels[i] || 'No slot'}
      </td>

      {activeTimetableDays.map((day, j) => {
        const cell = row[j];
        const rowStart = activeTimetableRowStarts[i];
        const hasTimeRange = activeTimetableViewConfig.daySlotStarts[day]?.includes(rowStart);

        if (!cell || !hasTimeRange) {
          return (
            <td key={`${day}-${i}`} className="p-3 border-r">
              <div className="w-full min-h-20 rounded text-xs p-2 bg-gray-200 text-gray-500">
                No slot
              </div>
            </td>
          );
        }

        return (
        <td key={j} className="p-3 border-r">
          <div
            onClick={() => toggleCell(i, j, )}
            className={`w-full min-h-20 rounded text-xs p-2 cursor-pointer transition ${
              cell.completed
                ? 'bg-green-200'
                : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            <p className="font-medium leading-tight whitespace-normal break-words">{cell.subject}</p>
            <p className="text-[10px] leading-tight mt-1 whitespace-normal break-words">{cell.topic}</p>
          </div>
        </td>
      );
      })}
      
    </tr>
  ))}
</tbody>
        </table>
      </div>
      
      <div className="mt-8 flex justify-center space-x-8">
          <div className="flex items-center space-x-2"><div className="w-4 h-4 text-black bg-green-400 rounded"></div><span className="text-sm text-black">Completed</span></div>
          <div className="flex items-center space-x-2"><div className="w-4 h-4 text-black bg-red-400 rounded"></div><span className="text-sm text-black">Not Completed</span></div>
      </div>
    </div>
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");


  const handleRename = (id: string) => {
  if (!newName.trim()) return;

  setSavedTimetables((prev) =>
    prev.map((tt) =>
      tt.id === id ? { ...tt, name: newName } : tt
    )
  );

  setEditingId(null);
};

useEffect(()=> {
  localStorage.setItem(
    "Timetable",
    JSON.stringify(timetable)
  );
},[timetable]);

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      {renderHeader()}
      
      <main>
        {currentStep === 'subjects' && renderSubjectsScreen()}
        {currentStep === 'uploads' && renderUploadsScreen()}
        {currentStep === 'chat' && renderChatScreen()}
        {currentStep === 'timetable' && renderTimetableView()}
        {currentStep === 'data' && currentData()}
        
        {/* Placeholder for dashboard screen from wireframe */}
        {currentStep === 'dashboard' && (
            <div className="max-w-6xl mx-auto mt-10 p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <button
                  onClick={() => void generateTimetableWithAI()}
                  className="w-48 h-48 border-2 border-dashed border-gray-300 rounded flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition text-gray-500"
                >
                  <span className="text-3xl mb-2">+</span>
                  <span className="text-sm">{isGeneratingTimetable ? 'Generating...' : 'Generate with AI'}</span>
                </button>

                {savedTimetables.map((saved) => (
                      <div
                        key={saved.id}
                        className="w-64 bg-white border border-gray-200 rounded-xl p-3 shadow-sm hover:shadow-md transition flex flex-col"
                      >
                        {/* Header */}
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            {editingId === saved.id ? (
                              <input
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                onBlur={() => handleRename(saved.id)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleRename(saved.id);
                                }}
                                className="text-sm font-semibold text-gray-800 border-b border-blue-500 outline-none w-full"
                                autoFocus
                              />
                            ) : (
                              <p
                                onClick={() => {
                                  setEditingId(saved.id);
                                  setNewName(saved.name);
                                }}
                                className="text-sm font-semibold text-gray-800 truncate cursor-pointer hover:underline"
                              >
                                {saved.name}
                              </p>
                            )}
                            <p className="text-xs text-gray-500">
                              {saved.source === 'chat' ? 'From chat' : 'From timetable'}
                            </p>
                          </div>
                          <span className="text-[10px] text-gray-400">
                            {new Date(saved.createdAt).toLocaleDateString()}
                          </span>
                        </div>

                        {/* Preview */}
                        <div className="border border-gray-100 rounded-lg p-2 bg-gray-50 mb-3">
                          <div className="grid grid-cols-3 gap-2">
                            {saved.timetable
                              .slice(0, 2)
                              .flatMap((row) => row.slice(0, 3))
                              .map((cell, index) => (
                                <div
                                  key={`${saved.id}-${index}`}
                                  className="bg-white border border-gray-100 rounded-md p-1"
                                >
                                  <p className="text-xs font-medium text-gray-700 truncate">
                                    {cell.subject}
                                  </p>
                                  <p className="text-[10px] text-gray-400 truncate">
                                    {cell.topic}
                                  </p>
                                </div>
                              ))}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 mt-auto">
                          <button
                            onClick={() => openSavedTimetable(saved)}
                            className="flex-1 text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 hover:cursor-pointer transition"
                          >
                            Open
                          </button>
                          <button
                            onClick={() => deleteSavedTimetable(saved.id)}
                            className="px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 hover:cursor-pointer rounded-lg transition"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
              </div>
            </div>
        )}
      </main>
    </div>
  );


  
}