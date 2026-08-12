import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { initializeApp, cert, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import axios from 'axios';

// Initialize Firebase Admin (lazy)
let firebaseApp: App | null = null;
function getFirebaseAdmin() {
  if (!firebaseApp) {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      console.warn("FIREBASE_SERVICE_ACCOUNT_KEY not set.");
    } else {
      try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        firebaseApp = initializeApp({
          credential: cert(serviceAccount)
        });
      } catch (err) {
        console.error("Failed to initialize Firebase Admin", err);
      }
    }
  }
  return firebaseApp;
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const githubTools = [{
  functionDeclarations: [
    {
      name: 'create_repo',
      description: 'Create a new GitHub repository for the authenticated user.',
      parameters: {
        type: Type.OBJECT,
        properties: { name: { type: Type.STRING }, description: { type: Type.STRING }, private: { type: Type.BOOLEAN } },
        required: ['name']
      }
    },
    {
      name: 'delete_repo',
      description: 'Delete a GitHub repository owned by the user.',
      parameters: {
        type: Type.OBJECT,
        properties: { owner: { type: Type.STRING }, repo: { type: Type.STRING } },
        required: ['owner', 'repo']
      }
    },
    {
      name: 'read_repo_file',
      description: 'Read a file from a GitHub repository.',
      parameters: {
        type: Type.OBJECT,
        properties: { owner: { type: Type.STRING }, repo: { type: Type.STRING }, path: { type: Type.STRING } },
        required: ['owner', 'repo', 'path']
      }
    },
    {
      name: 'write_repo_file',
      description: 'Create or update a file in a GitHub repository.',
      parameters: {
        type: Type.OBJECT,
        properties: { owner: { type: Type.STRING }, repo: { type: Type.STRING }, path: { type: Type.STRING }, message: { type: Type.STRING }, content: { type: Type.STRING } },
        required: ['owner', 'repo', 'path', 'message', 'content']
      }
    }
  ]
}];

async function executeGitHubTool(call: any, token: string) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json'
  };
  
  try {
    if (call.name === 'create_repo') {
      const res = await axios.post('https://api.github.com/user/repos', call.args, { headers });
      return { url: res.data.html_url, fullName: res.data.full_name };
    } else if (call.name === 'delete_repo') {
      await axios.delete(`https://api.github.com/repos/${call.args.owner}/${call.args.repo}`, { headers });
      return { success: true };
    } else if (call.name === 'read_repo_file') {
      const res = await axios.get(`https://api.github.com/repos/${call.args.owner}/${call.args.repo}/contents/${call.args.path}`, { headers });
      if (res.data.content) {
        return { content: Buffer.from(res.data.content, 'base64').toString('utf8') };
      }
      return { error: 'Not a file' };
    } else if (call.name === 'write_repo_file') {
      // Need sha to update
      let sha;
      try {
        const getRes = await axios.get(`https://api.github.com/repos/${call.args.owner}/${call.args.repo}/contents/${call.args.path}`, { headers });
        sha = getRes.data.sha;
      } catch (e) {}
      
      const payload = {
        message: call.args.message,
        content: Buffer.from(call.args.content).toString('base64'),
        sha
      };
      const res = await axios.put(`https://api.github.com/repos/${call.args.owner}/${call.args.repo}/contents/${call.args.path}`, payload, { headers });
      return { url: res.data.content.html_url };
    }
  } catch (err: any) {
    return { error: err.response?.data?.message || err.message };
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.post('/api/chat', async (req, res) => {
    try {
      const { messages } = req.body;
      const authHeader = req.headers.authorization;
      
      let userId = null;
      let githubToken = null;
      let isPro = false;
      const adminApp = getFirebaseAdmin();
      
      if (authHeader && authHeader.startsWith('Bearer ') && adminApp) {
        const token = authHeader.split('Bearer ')[1];
        const decoded = await getAuth(adminApp).verifyIdToken(token);
        userId = decoded.uid;
        
        const db = getFirestore(adminApp);
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        
        if (userData) {
          isPro = !!userData.isPro;
          githubToken = userData.githubToken;
          
          if (!isPro) {
            if (userData.credits <= 0) {
              return res.status(403).json({ error: 'Insufficient credits. Please upgrade your plan.' });
            }
            // Deduct credit
            await db.collection('users').doc(userId).update({ credits: userData.credits - 1 });
          }
        }
      }

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Messages array is required' });
      }

      const contents: any[] = messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));

      const tools = githubToken ? githubTools : [];
      let currentContents = [...contents];
      let responseText = '';
      
      const modelName = isPro ? 'gemini-3.1-pro-preview' : 'gemini-2.0-flash-lite-preview-02-05';
      const configOpts: any = { tools };
      if (isPro) {
        configOpts.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
      }

      for (let i = 0; i < 3; i++) {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: currentContents,
          config: configOpts
        });
        
        const functionCalls = response.functionCalls;
        if (functionCalls && functionCalls.length > 0) {
          currentContents.push({ role: 'model', parts: response.candidates![0].content.parts });
          const toolResponses: any[] = [];
          
          for (const call of functionCalls) {
            const result = await executeGitHubTool(call, githubToken!);
            toolResponses.push({
              functionResponse: {
                name: call.name,
                response: result
              }
            });
          }
          currentContents.push({ role: 'user', parts: toolResponses });
        } else {
          responseText = response.text || '';
          break;
        }
      }

      res.json({ text: responseText });
    } catch (error) {
      console.error('Chat API Error:', error);
      res.status(500).json({ error: 'Failed to generate response' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
