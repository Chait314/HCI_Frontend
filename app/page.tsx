"use client";

import { useEffect, useRef, useState } from 'react';
import { mainBackUrl } from './Urls';

type Step = 'subjects' | 'uploads' | 'chat' | 'timetable' | 'dashboard' | 'custom' | 'data'

interface Subject {
  id: number;
  name: string;
  strength: number | null;
}

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
    { id: 1, name: 'Mathematics', strength: null },
    { id: 2, name: 'Politics', strength: null },
    { id: 3, name: 'Literature', strength: null },
  ]);

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

      <div className="mt-8">
        <h3 className="text-lg text-gray-600 border-b pb-2 mb-4">Current Courses:</h3>
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
      handout: File;
    }
  const [handouts, setHandouts] = useState<Handout[]>([]);

  const handleFileUpload = (subjectid: number, file: File | null) => {
  if (!file) return;

  const newHandout: Handout = {
    subjectId: subjectid,
    handout: file
  };

  setHandouts(prev => [...prev, newHandout]);
};

const getFileName = (subjectId: number) => {
  return handouts.find(h => h.subjectId === subjectId)?.handout.name;
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
          <div
    key={subject.id}
    className="flex justify-between items-center p-4 bg-gray-50 border rounded"
  >
    <span className="font-medium text-gray-700">
      {index + 1}. {subject.name}
      <span className="text-xs text-green-600 ml-3">
        {getFileName(subject.id) || ''}
      </span>
    </span>

    <label className="px-4 py-2 bg-gray-300 text-gray-700 text-sm font-medium rounded hover:bg-gray-400 cursor-pointer">
      Upload
      <input
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) =>
          handleFileUpload(subject.id, e.target.files?.[0] || null)
        }
      />
    </label>
  </div>
        ))}
      </div>
    </div>
  );


  interface Chats {
    chat_id : string;
    chat_name: string;
    messages: {
      role: 'user' | 'ai';
      message: string;
      type?: 'text' | 'timetable'
    }[];
  }

  const [chats, setChats] = useState<Chats[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sendTex, setSendTex] = useState('');

  const [isSending, setIsSending] = useState(false);

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

    setSendTex(input);
    

    setChats(prevChats =>
      prevChats.map(chat =>
        chat.chat_id === currentChatId
          ? {
              ...chat,
              messages: [
                ...chat.messages,
                { role: 'user', message: input }
              ]
            }
          : chat
      )
    );

    setInput('');
    setIsSending(true);

    try {
        const res = await fetch(`${mainBackUrl}/chat`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ message: input })
    });

    const text = await res.text();

    const data = JSON.parse(text);

    console.log(data);

    // Add bot response
    setChats(prevChats =>
      prevChats.map(chat =>
        chat.chat_id === currentChatId
          ? {
              ...chat,
              messages: [
                ...chat.messages,
                { role: 'ai',type: 'timetable', message: data.reply }
              ]
            }
          : chat
      )
    );
    
    }catch (err) {
      console.error(err);
    }
    setIsSending(false);
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
          {chats.map(chat => (
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
      className={`p-4 rounded-lg max-w-md shadow-sm ${
        msg.role === 'user'
          ? 'bg-gray-100 text-gray-800 rounded-tr-none'
          : 'bg-gray-800 text-white rounded-tl-none'
      }`}
    >
      {msg.role === 'user' && <p>{msg.message}</p>}
      {/* TEXT MESSAGE */}
      
      {msg.type === 'timetable' && <p>{msg.message}</p>}
      
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

  // Screen 4: Timetable View
  const subjectTopics = {
  Mathematics: [
    'Limits', 'Derivatives', 'Integrals', 'Matrices', 'Probability', 'Vectors'
  ],
  Literature: [
    'Poetry Analysis', 'Shakespeare', 'Essays', 'Prose', 'Drama', 'Literary Devices'
  ],
  Politics: [
    'Constitution', 'Ideologies', 'Elections', 'Public Policy', 'International Relations', 'Governance'
  ]
};

const getRandomTopic = (subject: keyof typeof subjectTopics) => {
  const topics = subjectTopics[subject];
  return topics[Math.floor(Math.random() * topics.length)];
};
const subjos = ['Mathematics', 'Literature', 'Politics'];

  type Cell = {
      subject: string;
      topic: string;
      completed: boolean;
  };
    
const [timetable, setTimetable] = useState<Cell[][]>(() => {
  return Array.from({ length: 4 }, () =>
    Array.from({ length: 5 }, () => {
      const subjs = subjects[Math.floor(Math.random() * subjects.length)];
      return {
        subject: subjs.name,
        topic: getRandomTopic(subjs.name as keyof typeof subjectTopics),
        completed: false
      };
    })
  );
});

  const toggleCell = (rowIndex: number, colIndex: number) => {
    setTimetable(prev =>
      prev.map((row, i) =>
        row.map((cell, j) => {
          if (i === rowIndex && j === colIndex) {
            return { ...cell, completed: !cell.completed };
          }
          return cell;
        })
      )
    );
};

const openPDF = (file: File) => {
  const fileURL = URL.createObjectURL(file);
  window.open(fileURL, '_blank');
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
              {handout.handout.name}
            </span>
            <button
              onClick={() => openPDF(handout.handout)}
              className="text-xs px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 hover:cursor-pointer active:bg-blue-900"
            >
              Open
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
</div>
  )


  const renderTimetableView = () => (
    <div className="max-w-4xl mx-auto mt-10 p-6 bg-white border rounded shadow">
      <h2 className="text-xl font-medium text-gray-800 mb-2">We're glad you liked it!</h2>
      <p className="text-gray-600 mb-6">You can track your progress by marking green when you finished a task, else we'll mark it red.</p>
      
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-500 border-b">
                <th className="p-3 border-r font-medium">Time</th>
                <th className="p-3 border-r font-medium">Mon</th>
                <th className="p-3 border-r font-medium">Tue</th>
                <th className="p-3 border-r font-medium">Wed</th>
                <th className="p-3 border-r font-medium">Thu</th>
                <th className="p-3 font-medium">Fri</th>
            </tr>
          </thead>

            <tbody>
  {timetable.map((row, i) => (
    <tr key={i} className="border-b text-black last:border-0">
      
      <td className="p-3 border-r text-sm text-gray-500">
        Block {i + 1}
      </td>

      {row.map((cell, j) => (
        <td key={j} className="p-3 border-r">
          <div
            onClick={() => toggleCell(i, j)}
            className={`w-full h-12 rounded text-xs p-1 cursor-pointer transition ${
              cell.completed
                ? 'bg-green-200'
                : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            <p className="font-medium">{cell.subject}</p>
            <p className="text-[10px]">{cell.topic}</p>
          </div>
        </td>
      ))}
      
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
            <div className="max-w-4xl mx-auto mt-10 p-6 flex space-x-6">
                <div onClick={() => setCurrentStep('timetable')} className="w-48 h-48 bg-white border rounded shadow flex flex-col items-center justify-center cursor-pointer hover:shadow-md transition">
                  <div className="w-32 h-24 bg-gray-100 mb-2 border grid grid-cols-4 gap-0.5 p-1"><div className="bg-green-300"></div><div className="bg-red-300"></div></div>
                  <span className="text-sm text-gray-600">My_timetable1</span>
                </div>
                <div className="w-48 h-48 border-2 border-dashed border-gray-300 rounded flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition text-gray-500">
                  <span className="text-3xl mb-2">+</span>
                  <span className="text-sm">Create Custom</span>
                </div>
            </div>
        )}
      </main>
    </div>
  );


  
}