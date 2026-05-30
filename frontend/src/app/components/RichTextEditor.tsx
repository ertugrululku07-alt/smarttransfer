'use client';

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false });
import 'react-quill-new/dist/quill.snow.css';

interface RichTextEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  height?: number;
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, placeholder, height = 300 }) => {
  const modules = useMemo(() => ({
    toolbar: [
      [{ 'header': [1, 2, 3, 4, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'align': [] }],
      [{ 'list': 'ordered' }, { 'list': 'bullet' }],
      ['blockquote'],
      ['link', 'image'],
      ['clean']
    ],
  }), []);

  const formats = [
    'header', 'bold', 'italic', 'underline', 'strike',
    'color', 'background', 'align',
    'list', 'bullet', 'blockquote',
    'link', 'image'
  ];

  return (
    <div>
      <ReactQuill
        theme="snow"
        value={value || ''}
        onChange={onChange}
        modules={modules}
        formats={formats}
        placeholder={placeholder || 'İçeriğinizi buraya yazın...'}
        style={{ height, marginBottom: 42 }}
      />
      <style jsx global>{`
        .ql-toolbar.ql-snow { border-radius: 8px 8px 0 0; border-color: #d9d9d9; }
        .ql-container.ql-snow { border-radius: 0 0 8px 8px; border-color: #d9d9d9; font-size: 14px; }
        .ql-editor { min-height: ${height}px; }
        .ql-editor h1 { font-size: 2em; font-weight: 700; }
        .ql-editor h2 { font-size: 1.5em; font-weight: 600; }
        .ql-editor h3 { font-size: 1.17em; font-weight: 600; }
        .ql-editor p { margin-bottom: 0.8em; line-height: 1.7; }
      `}</style>
    </div>
  );
};

export default RichTextEditor;
