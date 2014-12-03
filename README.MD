#Etherpty
a simple, fast way to broadcast your pty. 

---
##Installation
~~~

npm install etherpty-cli -g

~~~
##Usage
To broadcast(share) your pty,
~~~
$etherpty share
~~~
If connected, you may get the information like
~~~
Your shell is shared at: http://etherpty.io/b0f3003a47574a9dada220208e389a92
~~~
Now, you can spread the unique url to anyone you want to share. The listeners just need to paste the url into their browser and everything from your pty will broadcast to them now.

####Editable mode
In some situation, you may allow the listener to control your pty(i.e. your pty is editable), just share your pty in the editable way
~~~
$etherpty share --editabe
~~~
Notice: your shared pty is uneditable to the listeners in default.

##Configuration
You can config your own etherpty server (instead of etherpty.io) in `config/config.json`, or specific by the command line argv like
~~~
$etherpty share http://yourserverip:port
~~~

##License
MIT
