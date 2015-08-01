var PORT = 34988;
var HOST = '192.168.0.59';
var mqtt = require('mqtt')
var mclient = mqtt.connect({ port: 1883, host: '192.168.0.70', protocol: 'mqtt' });
var vgram565buf = new Buffer(1);
var currentpage = 0; //maintain current page
var init = 1; // on startup of this program first init, on startup of the switch we also use this bit
var startline = 0;
var linecount = 0;
var startcolumn = 0;
var columncount = 0;


var fs = require('fs')
  , gm = require('gm');
  
vmesc = 0;                                                                                  
packid = 0;

headerhex = '01861000320225000000000001000100';
headerbuffer = new Buffer(headerhex,'hex');
idstatereqbuf = new Buffer('04010000','hex');
idcontrolereqbuf = new Buffer('04210000','hex');
controlsetbuf = new Buffer('0821000016000000','hex');
playlocalsoundbuf = new Buffer('10980000640000000000000000000100','hex');

var dgram = require('dgram');
var server = dgram.createSocket('udp4');
//var client = dgram.createSocket('udp4');

server.on('listening', function () {
    var address = server.address();
    console.log('UDP Server listening on ' + address.address + ":" + address.port);
});
        
server.on('message', function (buffer, remote) {
//    console.log(remote.address + ':' + remote.port +' - ' + message);
//  console.log('datagram received:');
//  console.log( buffer);
//  console.log(message);          
//  console.log(message.readUInt16LE(2));
  header = buffer.slice(0,16);
//  console.log('header:');
//  console.log(header);
  if(header[0] == 0x01) {
   buffer = buffer.slice(16);
   if(remote.address == '192.168.0.101') {
    var ulux = 'switch1';
   }
// now handle all messages
   while (buffer.length > 0) { 
    message = buffer.slice(0,buffer[0]);
    console.log(message);
    if(message[1] == "0x01") { //===control message
      if(message[4]&"0x40") {  //init request message, need to reply
        m1 = CreateControlMessage();
        datagram = CreateDgram(m1);
        init = 1;
        currentpage = 0;
        if(message[4]&"0x20") { //init + time request message, need to reply
          console.log('init + time');
          m2 = CreateDateTimeMessage();
          datagram = AppendDgram(datagram,m2);
        }
  //      console.log('message to be sent ::: xxx');
  //      console.log(datagram);
        SendDatagram(datagram);
      } else if(message[4]&"0x20") { //time request only message, need to reply
        console.log('time');
      } else { // other control message, no reply needed, just put event on mqtt
        if (init == 1) { // second message overall received, flow to video page to get video parameters
          OpenDoorbellPage()
        }
        var state = {};
        state.ulux = ulux;
        if(message[4]&"0x02") {
          state.proximity = 'ON';
        } else {
          state.proximity = 'OFF';
        }
        if(message[4]&"0x04") {
          state.display = 'ON';
        } else {
          state.display = 'OFF';
        }
        console.log(state);
      } // else
    } else if(message[1] == "0x2e") { //===pageid message
      //console.log('page changed');
      //console.log(message[4]);
      currentpage = message[4]; // update global var currentpage
      if (message[4] == 4) { // doorbel page
        if (init == 1) { //request video params
          m=CreateVideoStateMessage(22);
          d=CreateDgram(m);
          SendDatagram(d);
          console.log('init so request video state for parameters');
        } else if(vgram565buf.length > 1) { //if not init and buffer is filled, meaning there is a picture, start video play
          console.log('showtime');
          m = CreateVideoStartMessage(22);
          d=CreateDgram(m);
          SendDatagram(d);
        }
      } else if (message[4] == 5) { // dummy page, need to go to 4 next
        OpenDoorbellPage();
      }
    } else if(message[1] == "0x42") { //===editvalue message
      console.log(message);
//    console.log(message.readUInt16LE(20));
      var ms = {};
      ms.id = message.readUInt16LE(2);
      ms.value = message.readUInt16LE(4)
      console.log(ms);    
      
    } else if(message[1] == 0xa1) { //===videostate message
      if (init == 1) {
        if (message[4] == 0x02) {
          startline = message[10];
          linecount = message[14] - message[10];
          startcolumn = message[8];
          columncount = message[12] - message[8];
          console.log ('now we know : ' + linecount);
          init = 0;
          GoToPage(0) // now return to home page
        }
      }
      console.log('this should be logged when I send the command to show picture');
      if (message[4] == 0x03) {
        console.log('video play bit is on');
        var v2 = vgram565buf.slice(0,vgramsize);
        console.log(v2);
        SendDatagram(v2); 
        vmesc = 0;                                       
      
    }
    }
   
//    console.log(buffer[0])
    buffer = buffer.slice(buffer[0]);
  }
   } else { //video message reply
     console.log('video reply, send next vgram');
     vmesc = vmesc+1;
     console.log('reply nr: ' + vmesc);
     if (vmesc < numofmessages-1) {
       var v2 = vgram565buf.slice(vmesc*vgramsize,(vmesc+1)*vgramsize);
       console.log(v2);
       SendDatagram(v2);
     } else if (vmesc == numofmessages-1) {
       console.log('second to last');
       var v2 = vgram565buf.slice(vmesc*vgramsize,vmesc*vgramsize+lastvgramsize);
       console.log(v2);
       console.log(v2.length);
       SendDatagram(v2);
     } else {
       console.log('last reply received');
     }
   }
});

mclient.on('connect', function () {
  mclient.subscribe(['Update/Ulux','Command/Ulux']);
});
  
mclient.on('message', function (topic, message) {
  console.log(message.toString());
  console.log(topic)
  var c = JSON.parse(message);
  if (topic.substr(0,6) == 'Update') {
    m=CreateRealValueMessage(c.id,c.realvalue0);
    d=CreateDgram(m);
    console.log(d);
    SendDatagram(d);
  } else {
    if (c.command == 'show picture') {
      m=CreateActivateMessage ()
      d=CreateDgram(m);
      SendDatagram(d);
      m=CreateTextMessage (22,0,c.date);
      d=CreateDgram(m);
//      SendDatagram(d);
//      console.log(c.date);
      m=CreateTextMessage (22,1,c.time);
      d=AppendDgram(d,m);
//      SendDatagram(d);
      m=CreateTextMessage (22,2,c.location);
      console.log(c.location);
      d=AppendDgram(d,m);
      console.log(d);
      SendDatagram(d);
      // need to change this into one datagram
      console.log(c.filename);
      CreateRGB565VideoBuffer(c.filename,columncount,linecount,OpenDoorbellPage);    
      
    }
    // write picture
//    m3 = CreatePageIndexMessage(4)
//    m1 = CreateVideoStartMessage(22);
//    d=CreateDgram(m3);
//    console.log(d);
//    SendDatagram(d);
//    d=CreateDgram(m1);
//    SendDatagram(d);
  }
});
                        
            
function CreateDgram (message) {
  var len = message.length + 16;
  datagram = new Buffer(len);
  datagram = Buffer.concat([headerbuffer,message],len);
  packid = packid+1;
  if (packid == 65536) {
    packid = 1;
  }
  datagram.writeUInt16LE(len, 2);
  //datagram[2] = len;
  datagram.writeUInt16LE(packid, 6);
  return datagram;
};

function CreateVgram (message) {
  var vgram = CreateDgram(message);
  vgram[0] = 0x03;
//  datagram.writeUInt16LE(4, 6);
  return vgram;
}

function AppendDgram (datagram,message) {
  var len = datagram.length + message.length;
  datagram = Buffer.concat([datagram,message],len);
  datagram[2] = len;
  return datagram;
};    

function SendDatagram(datagram) {
  server.send(datagram, 0, datagram.length, PORT, '192.168.0.101', function(err, bytes) {
    if (err) throw err;
  })
};
                  
function CreateDateTimeMessage() {
  var mes = Buffer(12);
  var d = new Date();
  mes[0] = 0x0c;
  mes[1] = 0x2f;
  mes[2] = 0x00;
  mes[3] = 0x00;
  mes[4] = d.getSeconds();
  mes[5] = d.getMinutes();
  mes[6] = d.getHours();
  mes[7] = d.getUTCDay()
  mes[8] = d.getUTCDate();
  mes[9] = d.getMonth()+1;
  mes.writeUInt16LE(d.getFullYear(), 10);
  return mes;
}  

function CreateControlMessage() {
  return controlsetbuf;
}

function CreateRealValueMessage(actor,RV0,RV1,RV2,RV3) {
  var mes = Buffer(6);
  mes[0] = 0x06;
  mes[1] = 0x43;
  mes.writeUInt16LE(actor, 2);
  mes.writeUInt16LE(RV0, 4);
  return mes;
}

function CreateTextMessage (actor,id,t) {
  var len = t.length + 13;
  var mes = Buffer(len);
  mes[0] = len;
  mes[1] = 0x45
  mes.writeUInt16LE(actor, 2);
  mes[4] = 0x01;
  mes[5] = 0x00;
  mes[6] = 0x00;
  mes[7] = 0x00;
  mes.writeUInt8(id,8);
  mes[9] = 0x1c;
  mes[10] = 0x00;
  mes[11] = 0x00;
  mes.write(t,12,t.length,"ascii");
  mes[len-1] = 0x00;
  return mes;
}
      
function CreateVideoStateMessage(actor) {
  var mes = Buffer(4);
  mes[0] = 0x04;
  mes[1] = 0xa1;
  mes.writeUInt16LE(actor, 2);  
  return mes;
}

function CreateVideoStartMessage(actor) {
  var mes = Buffer(12)
  mes[0] = 0x0c;
  mes[1] = 0xa2;
  mes.writeUInt16LE(actor, 2);
  mes.writeUInt32LE(0, 4); //state flags
  mes.writeUInt32LE(123, 8); //seqid
  return mes;
}
  
function createVideoXXMessage(sl,lc,vdata) {
//  console.log(vdata.length);
  var mes = Buffer(16);
  mes.writeUInt32LE(1, 0); //state flags
  mes.writeUInt32LE(123, 4); //seqid
  mes.writeUInt16LE(sl, 8); //start line
  mes.writeUInt16LE(lc, 10); //line count
  mes.writeUInt16LE(startcolumn, 12); //start column
  mes.writeUInt16LE(columncount, 14); //column count
//  console.log(vdata);
  mes = Buffer.concat([mes,vdata],vdata.length+16);
  return mes;
}        

function CreatePageIndexMessage(pageid) {
  var mes = Buffer(6);
  mes[0] = 0x06;
  mes[1] = 0x2e;
  mes[2] = 0x00;
  mes[3] = 0x00;
  mes.writeUInt8(pageid,4)
  mes[5] = 0x00;
  return(mes);         
}      

function CreatePageIndexReqMessage() {
  var mes = Buffer(4);
  mes[0] = 0x04;
  mes[1] = 0x2e;
  mes[2] = 0x00;
  mes[3] = 0x00;
  return(mes);
}

function CreateActivateMessage () {
  var mes = Buffer(6);
  mes[0] = 0x06;
  mes[1] = 0x2d;
  mes[2] = 0x00;
  mes[3] = 0x00;
  mes[4] = 0x01;
  mes[5] = 0x00;
  return(mes);
}
                
function CreateRGB565VideoBuffer(filename,width,height,callback) {
  //console.log(filename);
  //console.log(width);
  gm(filename)
  .crop(900,720,100,0)
  .resize(columncount,linecount)
  .noProfile()
  .toBuffer('RGB',function (err, rgb888buf) {
    if (err) return handle(err);
    //console.log(ybuf.length);
    //console.log('resize done!');
    rgb565len = rgb888buf.length*2/3;
    //console.log(xlen);
    var rgb565buf = new Buffer(rgb565len);
    for (i = 0; i < rgb888buf.length/3; i++) {
      var r = rgb888buf[3*i] >> 3;
      var g = rgb888buf[3*i+1] >> 2;
      var b = rgb888buf[3*i+2] >> 3;
      rgb565buf.writeUInt16LE((r << 11) | (g << 5) | b, i*2);
    }
    console.log('rgb565buf lengte = ' + rgb565buf.length);
    //now create the message to send to the switch in a single buffer, for now hardcoded.
    linespermessage = Math.floor(704/width); //columncount, vervangen
    numofmessages = Math.ceil(height/linespermessage);
    messagesize = width*linespermessage*2;
    lastmessagesize = rgb565buf.length+messagesize-(messagesize*numofmessages);
    linesperlastmessage = lastmessagesize/352;
    vgramsize = messagesize+32;
    lastvgramsize = lastmessagesize+32;
    console.log(linespermessage);
    console.log(numofmessages);
    console.log(messagesize)
    console.log(lastmessagesize);
    for (i = 0; i < numofmessages-1; i++) {
      tempbuf = rgb565buf.slice(i*messagesize,(i+1)*messagesize);
//          console.log(tbuf);
      videomes = createVideoXXMessage(startline+i*linespermessage,linespermessage,tempbuf);
//          console.log(mv);
      vgram = CreateVgram(videomes);
//          console.log(v1.length);
//      console.log(vgram);
      if (i == 0) {
        vgramtbuf = Buffer(vgram);
      } else {
        vgramtbuf = Buffer.concat([vgramtbuf,vgram],vgramtbuf.length+vgram.length);
      } 
    }
    tempbuf = rgb565buf.slice(i*messagesize,i*messagesize+lastmessagesize); // reculculate!!!!
//    videomes = createVideoXXMessage(startline+i*linespermessage, linesperlastmessage,tempbuf);
    videomes = createVideoXXMessage(startline+i*linespermessage, 1,tempbuf);
    vgram = CreateVgram(videomes);
    console.log(vgram);
    vgramtbuf = Buffer.concat([vgramtbuf,vgram],vgramtbuf.length+vgram.length);
    vgram565buf = vgramtbuf.slice();
    console.log('x');
    console.log(vgramtbuf);
    console.log(vgram565buf.length);
    callback();
  })
}  

function OpenDoorbellPage() {
  if (currentpage != 4) {
    m = CreatePageIndexMessage(4);
  } else {
    console.log('already on 4');
//    m = CreatePageIndexReqMessage();
    m = CreatePageIndexMessage(5);
  }
  d=CreateDgram(m);
  SendDatagram(d);
}

function GoToPage(pageid) {
  m = CreatePageIndexMessage(pageid);
  d=CreateDgram(m);
  SendDatagram(d);
}
  
server.bind(PORT, HOST);

//setTimeout(console.log('pep'),200);
setTimeout(GoToPage(5),10000);

// need to go to dummy page