"use strict";(self.webpackChunkdocumentation=self.webpackChunkdocumentation||[]).push([[12],{1708:(e,t,n)=>{n.r(t),n.d(t,{assets:()=>o,contentTitle:()=>a,default:()=>u,frontMatter:()=>l,metadata:()=>i,toc:()=>d});var s=n(2488),r=n(7052);const l={title:"Net-Level Server Setup",slug:"/setup"},a=void 0,i={id:"setup",title:"Net-Level Server Setup",description:"Install",source:"@site/docs/setup.md",sourceDirName:".",slug:"/setup",permalink:"/net-level/docs/setup",draft:!1,unlisted:!1,tags:[],version:"current",frontMatter:{title:"Net-Level Server Setup",slug:"/setup"},sidebar:"docs",previous:{title:"Distributed LevelDB",permalink:"/net-level/docs/"},next:{title:"Command Line Client",permalink:"/net-level/docs/cli"}},o={},d=[{value:"Install",id:"install",level:2},{value:"Start Net-Level Server",id:"start-net-level-server",level:2}];function c(e){const t={a:"a",code:"code",h2:"h2",p:"p",pre:"pre",...(0,r.M)(),...e.components};return(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)(t.h2,{id:"install",children:"Install"}),"\n",(0,s.jsx)(t.pre,{children:(0,s.jsx)(t.code,{className:"language-shell",children:"yarn install\n// or\nnpm install\n"})}),"\n",(0,s.jsx)(t.h2,{id:"start-net-level-server",children:"Start Net-Level Server"}),"\n",(0,s.jsx)(t.p,{children:"The default port for net-level is 3000. This may conflict with other processes, so best to set a port you know is not in use."}),"\n",(0,s.jsx)(t.pre,{children:(0,s.jsx)(t.code,{className:"language-shell",children:"node lib/server --user=admin --pass=adminpass --port 3333\n"})}),"\n",(0,s.jsx)(t.p,{children:"Or you can use environment variables to seed the user and password"}),"\n",(0,s.jsx)(t.pre,{children:(0,s.jsx)(t.code,{className:"language-shell",children:"DB_USER=admin DB_PASS=adminpass node lib/server --port 3333\n"})}),"\n",(0,s.jsxs)(t.p,{children:["Starting the server will create ",(0,s.jsx)(t.code,{children:"data/.users"})," if it does not already exist and add (or update) the referenced user and password. Starting the server does not require a username and password provided if the ",(0,s.jsx)(t.code,{children:"data/.users"})," file already exists."]}),"\n",(0,s.jsxs)(t.p,{children:["To run servers in production, consider using ",(0,s.jsx)(t.a,{href:"https://www.npmjs.com/package/pm2",children:"PM2"})]})]})}function u(e={}){const{wrapper:t}={...(0,r.M)(),...e.components};return t?(0,s.jsx)(t,{...e,children:(0,s.jsx)(c,{...e})}):c(e)}},7052:(e,t,n)=>{n.d(t,{I:()=>i,M:()=>a});var s=n(6651);const r={},l=s.createContext(r);function a(e){const t=s.useContext(l);return s.useMemo((function(){return"function"==typeof e?e(t):{...t,...e}}),[t,e])}function i(e){let t;return t=e.disableParentContext?"function"==typeof e.components?e.components(r):e.components||r:a(e.components),s.createElement(l.Provider,{value:t},e.children)}}}]);