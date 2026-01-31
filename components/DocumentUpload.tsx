'use client';

import React, { useRef } from 'react';
import { Upload, FileText, X } from 'lucide-react';

interface DocumentUploadProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  onClear: () => void;
  isUploading: boolean;
}

const DocumentUpload: React.FC<DocumentUploadProps> = ({ 
  onFileSelect, 
  selectedFile, 
  onClear,
  isUploading 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="mt-4">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".pdf,.docx,.txt"
        className="hidden"
      />
      
      {!selectedFile ? (
        <button
          onClick={handleClick}
          disabled={isUploading}
          className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-500 transition-colors disabled:opacity-50"
        >
          <Upload size={18} />
          <span>Upload Document for Analysis</span>
        </button>
      ) : (
        <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <FileText className="text-blue-600" size={20} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-blue-900 truncate">
              {selectedFile.name}
            </p>
            <p className="text-xs text-blue-700">
              {(selectedFile.size / 1024).toFixed(1)} KB
            </p>
          </div>
          <button
            onClick={onClear}
            className="p-1 hover:bg-blue-100 rounded-full text-blue-600"
            disabled={isUploading}
          >
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
};

export default DocumentUpload;
