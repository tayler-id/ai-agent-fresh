'use client';

import { useChat } from '@ai-sdk/react';

export default function ChatPage() {
  const { messages, input, handleInputChange, handleSubmit, error } = useChat();
  // By default, useChat will call '/api/chat'

  return (
    <div className="flex flex-col w-full max-w-2xl min-h-screen py-12 mx-auto stretch">
      {error && (
        <div className="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-200 dark:text-red-800" role="alert">
          <span className="font-medium">Error:</span> {error.message}
        </div>
      )}
      <div className="flex-grow mb-4 overflow-auto">
        {messages.length > 0 ? (
          messages.map(m => (
            <div key={m.id} className={`whitespace-pre-wrap p-2 my-2 rounded-lg ${
              m.role === 'user' ? 'bg-blue-100 dark:bg-blue-800 ml-auto w-auto max-w-[80%]' : 'bg-gray-100 dark:bg-gray-700 mr-auto w-auto max-w-[80%]'
            }`}>
              <span className="font-bold">
                {m.role === 'user' ? 'User: ' : 'AI: '}
              </span>
              {m.content}
            </div>
          ))
        ) : (
          <div className="text-center text-gray-500 dark:text-gray-400">
            No messages yet. Start a conversation!
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="fixed bottom-0 w-full max-w-2xl p-4 pb-8 bg-white dark:bg-zinc-900 border-t dark:border-zinc-700">
        <div className="flex items-center">
          <input
            className="w-full p-3 border border-gray-300 rounded-l-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-800 dark:border-zinc-600 dark:text-white"
            value={input}
            placeholder="Say something..."
            onChange={handleInputChange}
          />
          <button
            type="submit"
            className="p-3 text-white bg-blue-600 rounded-r-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
