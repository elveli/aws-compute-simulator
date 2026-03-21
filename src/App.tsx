import React, { useState, useEffect } from 'react';
import Markdown from 'react-markdown';
import { Terminal, Code, Server, Cloud, CheckCircle2, Copy } from 'lucide-react';

export default function App() {
  const [readmeContent, setReadmeContent] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/README.md')
      .then(res => res.text())
      .then(text => setReadmeContent(text))
      .catch(err => console.error("Failed to load README", err));
  }, []);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-orange-500/30">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-500/10 rounded-lg">
              <Terminal className="w-6 h-6 text-orange-500" />
            </div>
            <h1 className="text-xl font-semibold text-white">AWS Compute Showcase (IaC)</h1>
          </div>
          <div className="flex items-center gap-4 text-sm font-medium text-slate-400">
            <span className="flex items-center gap-2 text-emerald-400 bg-emerald-400/10 px-3 py-1.5 rounded-full">
              <CheckCircle2 className="w-4 h-4" />
              Terraform Ready
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid lg:grid-cols-12 gap-8">
          
          {/* Left Column: Info & Architecture */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                <Server className="w-5 h-5 text-blue-400" />
                Repository Pivot
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                This repository has been pivoted from a frontend-only React simulator to a fully functional <strong>Infrastructure as Code (IaC)</strong> project.
              </p>
              <p className="text-slate-400 text-sm leading-relaxed mt-4">
                You can now use the provided Terraform code to deploy real AWS infrastructure and test these scaling paradigms yourself.
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                <Code className="w-5 h-5 text-purple-400" />
                Terraform Modules
              </h2>
              <ul className="space-y-3 text-sm text-slate-400">
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                  <code>terraform/vpc.tf</code>
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                  <code>terraform/eks.tf</code> (Karpenter)
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                  <code>terraform/ecs.tf</code> (Fargate)
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                  <code>terraform/kargo.tf</code> (ArgoCD & Kargo)
                </li>
              </ul>
            </div>
          </div>

          {/* Right Column: Deployment Guide (README) */}
          <div className="lg:col-span-8">
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="bg-slate-800/50 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Cloud className="w-5 h-5 text-orange-400" />
                  Deployment Guide
                </h2>
                <button 
                  onClick={() => handleCopy(readmeContent)}
                  className="text-slate-400 hover:text-white transition-colors flex items-center gap-2 text-sm"
                >
                  {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied!' : 'Copy Raw'}
                </button>
              </div>
              <div className="p-6 lg:p-8 prose prose-invert prose-slate max-w-none prose-pre:bg-slate-950 prose-pre:border prose-pre:border-slate-800">
                <Markdown>{readmeContent}</Markdown>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
