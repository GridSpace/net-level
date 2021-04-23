(window.webpackJsonp=window.webpackJsonp||[]).push([[5],{75:function(e,t,n){"use strict";n.r(t),n.d(t,"frontMatter",(function(){return l})),n.d(t,"metadata",(function(){return i})),n.d(t,"toc",(function(){return o})),n.d(t,"default",(function(){return u}));var r=n(3),s=n(7),a=(n(0),n(90)),l={title:"Net-Level Server Setup",slug:"/setup"},i={unversionedId:"setup",id:"setup",isDocsHomePage:!1,title:"Net-Level Server Setup",description:"Install",source:"@site/docs/setup.md",sourceDirName:".",slug:"/setup",permalink:"/net-level/docs/setup",version:"current",frontMatter:{title:"Net-Level Server Setup",slug:"/setup"},sidebar:"docs",previous:{title:"Distributed LevelDB",permalink:"/net-level/docs/"},next:{title:"Command Line Client",permalink:"/net-level/docs/cli"}},o=[{value:"Install",id:"install",children:[]},{value:"Start Net-Level Server",id:"start-net-level-server",children:[]}],p={toc:o};function u(e){var t=e.components,n=Object(s.a)(e,["components"]);return Object(a.b)("wrapper",Object(r.a)({},p,n,{components:t,mdxType:"MDXLayout"}),Object(a.b)("h2",{id:"install"},"Install"),Object(a.b)("pre",null,Object(a.b)("code",{parentName:"pre",className:"language-shell"},"yarn install\n// or\nnpm iinstall\n")),Object(a.b)("h2",{id:"start-net-level-server"},"Start Net-Level Server"),Object(a.b)("p",null,"The default port for net-level is 3000. This may conflict with other processes, so best to set a port you know is not in use."),Object(a.b)("pre",null,Object(a.b)("code",{parentName:"pre",className:"language-shell"},"node lib/server --user=admin --pass=adminpass --port 3333\n")),Object(a.b)("p",null,"Starting the server will create ",Object(a.b)("inlineCode",{parentName:"p"},"data/.users")," if it does not already exist and add (or update) the referenced user and password. Starting the server does not require a username and password provided if the ",Object(a.b)("inlineCode",{parentName:"p"},"data/.users")," file already exists."),Object(a.b)("p",null,"To run servers in production, consider using ",Object(a.b)("a",{parentName:"p",href:"https://www.npmjs.com/package/pm2"},"PM2")))}u.isMDXComponent=!0}}]);