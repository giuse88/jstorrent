(function() {

    var mp4_hash = '005e12ca06e2e632637b97f7fc98519b75610baa'; // metcalf
    //var mp4_hash = '5dc867236f95b7a7983bc7ca7122129e6f30ecae'; // san bruno

    function setup_video(video) {
        setInterval( function() {
            /*
              for (var i=0; i<video.buffered.length; i++) {
              console.log('bufrange',i,video.buffered[i]);
              }
            */
            //console.log('network state', video.networkState);
        }, 1000 );
        // video.startTime
        video.addEventListener("readystatechange", function(evt) { console.log('readystatechange'); } );
        video.addEventListener("stalled", function(evt) { console.log("stalled",evt); } );
        video.addEventListener("durationchange", function(evt) { console.log('durationchange',evt); } );
        video.addEventListener("loadstart", function(evt) { console.log("load start",evt); } );
        video.addEventListener("abort", function(evt) { console.log("abort",evt); } );
        video.addEventListener("loadedmetadata", function(evt) { console.log("got metadata",evt); } );
        video.addEventListener("error", function(evt) { console.log("got error",evt); 
                                                        console.log('video state: ',video.readyState);
                                                      } );
        video.addEventListener("canplay", function(evt) { console.log('canplay',evt); } );
        video.addEventListener("progress", function(evt) { console.log("progress",evt); } );
        video.addEventListener("seek", function(evt) { console.log('seek',evt); } );
        video.addEventListener("seeked", function(evt) { console.log('seeked',evt); } );
        video.addEventListener("ended", function(evt) { console.log('ended',evt); } );
        //video.addEventListener("timeupdate", function(evt) { console.log('timeupdate',evt); } );
        video.addEventListener("pause", function(evt) { console.log('pause',evt); } );
        video.addEventListener("play", function(evt) { console.log('play',evt); } );
        video.addEventListener("suspend", function(evt) {
            console.log('suspend event',evt);
        });
        //video.load();
    }


    jstorrent.FileSystemVideoModel = Backbone.Model.extend({
        initialize: function(opts) {
            this.set('has_metadata',false);
            this.entry = opts.entry;
            this.file = opts.file;
            this.video = document.createElement('video');
            this.video.setAttribute('width', $(window).width());
            this.video.setAttribute('height', $(window).height());
            this.video.src = this.entry.toURL();
            //this.video.src = "http://127.0.0.1:10000/proxy?hash=" + encodeURIComponent(mp4_hash);
            this.video.autoplay = false;
            this.video.preload = "none";

            //this.video.controls = true;
            setup_video(this.video);

            this.file.on('change:unsupported_stream', _.bind(function(){
                alert('unable to stream this file, ' + this.file.get('unsupported_stream'))
                this.close();
            },this));

            this.video.addEventListener("loadedmetadata", _.bind(function(evt) { 
                mylog(1,'loaded video metadata',evt.target.buffered.start(0),evt.target.buffered.end(0))
                this.set('width',evt.target.videoWidth);
                this.set('height',evt.target.videoHeight);
                if (! this.get('scalevideo')) {
                    this.video.setAttribute('width',this.get('width'))
                    this.video.setAttribute('height',this.get('height'))
                }
                this.set('has_metadata',true);
            },this));
            this.video.addEventListener("canplay", _.bind(function(evt) { 
                if (this.get('autostart')) { 

                    this.play()
                    this.set('autostart',false);
                }
                if (this.get('onerrortime')) {
                    var t = this.get('onerrortime');
                    if (true) {
                        mylog(1,'video resume at error to',t);
                        this.seek(t);
                    } else {
                        //this.file.torrent.set('first_incomplete', 0);
                    }

                    this.set('onerrortime',null);
                }
                this.trigger('canplay');
            },this));
            this.video.addEventListener('error', _.bind(this.onerror, this));
            //this.video.muted = true;

            if (this.file.complete()) {
                this.video.controls = true;
                this.video.preload = 'metadata';
            } else {
                this.file.torrent.register_proxy_stream( this );
            }
        },
        get_video_track: function() {
            var mp4file = this.file.get('mp4file')
            if (mp4file) {
                return mp4file.tracks[1];
            }
        },
        get_info: function() {
            var track = this.get_video_track()
            if (track) {
                var offset = track.sampleToOffset( track.timeToSample(  track.secondsToTime(this.video.currentTime) ) );
                //var filestartpiece = this.file.get_piece_boundaries()[0];
                var piece = Math.floor((offset + this.file.start_byte) / this.file.torrent.piece_size);
                return 'playing piece ' + piece;
            } else {
                return 'no track loaded'
            }
            
        },
        play: function() {
            mylog(1,'playing');
            this.video.play();
        },
        close: function() {
            this.video.pause();
            this.trigger('stream_cancel'); // same as this.file.torrent.unregister_proxy_stream( this );
            this.trigger('close');
        },
        pause: function() {
            mylog(1,'pausing');
            this.video.pause();
        },
        seek: function(t) {
            mylog(1,'seeking to',t);
            this.video.currentTime = t;
        },
        onerror: function() {
            this.set('onerrortime', Math.max(0,this.video.currentTime - 0.1));
            setTimeout( _.bind(function() {
                this.video.load()
            },this), 1000);
            //this.seek(t);
        }
    });

    jstorrent.VideoControlsView = Backbone.View.extend({
        initialize: function(opts) {
            this.opts = {
                height: 30
            };
            this.$el.html( $('#video_controls_template').html() );
            _.bindAll(this,'onseek');
            this.bind_model_events();
        },
        setup_buttons: function() {
            this.model.video.addEventListener("pause", _.bind(function(evt) { 
                this.$('.control-play-pause').text('Play');
            },this));
            this.model.video.addEventListener("play", _.bind(function(evt) { 
                this.$('.control-play-pause').text('Pause');
            },this));

            this.$('.control-play-pause').text('Play');

            this.$('.control-close').click( _.bind(function() {
                clearInterval( this.update_canvas_interval );
                this.model.close()
            }, this));

            this.$('.control-play-pause').click( _.bind(function() {
                if (this.model.video.paused) {
                    this.model.play();
                } else {
                    this.model.pause();
                }
            },this));
        },
        update_canvas: function() {
            var v = this.model.video;
            var canvas = this.$('.seekbar')[0];
            if (! this._setcanvas) {
                this._setcanvas=true;
                canvas.setAttribute('width',v.videoWidth);
                canvas.setAttribute('height',this.opts.height);
            }
            var ctx = canvas.getContext('2d');
            ctx.clearRect(0,0,canvas.width,canvas.height)
            ctx.fillStyle = "rgba(100,100,100,0.3)";
            ctx.fillRect(0,0,canvas.width,canvas.height);
/*
  // only valid for http streaming
            for (var i=0; i<this.model.video.buffered.length; i++) {
                ctx.fillStyle = "rgb(0,255,"+(i*50)%255+")";
                var start = this.model.video.buffered.start(i)/this.model.video.duration * canvas.width;
                var end =  this.model.video.buffered.end(i)/this.model.video.duration * canvas.width;
                ctx.fillRect(start, canvas.height/2, end-start, canvas.height/2);
            }
*/
            var torrent = this.model.file.torrent;
            var mp4file = this.model.file.get('mp4file')
            var ranges = this.model.file.get_complete_ranges();

            if (mp4file) {
                var vid_track = mp4file.tracks[1];
                ctx.fillStyle = "rgba(255,255,255,0.3)";
                for (var i=0; i<ranges.length; i++) {
                    var start = vid_track.byteToTimeInSeconds(ranges[i][0]) / this.model.video.duration * canvas.width;
                    var end = vid_track.byteToTimeInSeconds(ranges[i][1]) / this.model.video.duration * canvas.width;
                    var pad = 7;
                    ctx.fillRect(start, pad, Math.max(2, end-start), canvas.height-pad*2);
                }
            }
            ctx.fillStyle = "blue";
            var x = v.currentTime / v.duration * canvas.width;
            ctx.fillRect(x, 0, 1, canvas.height);
            this.$('.info').text( this.model.get_info() );
        },
        drawdot: function(x) {
            var canvas = this.$('.seekbar')[0];
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = "rgb(137,200,137)";
            ctx.fillRect(x,canvas.height/2,1,canvas.height/3);
        },
        onseek: function(evt) {
            var vid_duration = this.model.video.duration;
            this.drawdot(evt.offsetX);

            console.log('click to seek!', evt.offsetX);
            if (this.model.get('buffering')) { console.log('already buffering'); return };


            var frac = evt.offsetX / this.model.video.videoWidth;


            if (this.model.file.complete()) {
                this.model.seek( frac * vid_duration )
                this.update_canvas();
                return;
            }

            this.model.pause();
            // on seek, CHECK

            this.model.set('seeked', frac);
            this.model.set('buffering',true);
            //this.model.seek( frac * this.model.file.get('mp4file').getTotalTimeInSeconds() );

            this.model.on('buffered', _.bind( function() {
                this.model.off('buffered');
                //var duration = this.model.file.get('mp4file').getTotalTimeInSeconds();
                this.model.seek( frac * vid_duration );
                this.update_canvas();
            },this));
            setTimeout( _.bind(function(){
                this.model.trigger('buffered')
                this.model.set('buffering',false);
            },this), 1000 );


        },
        bind_model_events: function() {
            this.$('.seekbar').click( this.onseek );

            this.model.on('change:has_metadata', _.bind(function() {
                this.$('.seekbar')[0].width = this.model.video.videoWidth;
                this.$('.seekbar')[0].height = this.opts.height;
            },this));

            this.model.on('canplay', _.bind(function() {

                if (this.model.get('setup')) { return; }

                this.model.set('setup',true);
/* // too slow
                this.model.file.on('newpiece', _.bind(function(){
                    this.update_canvas();
                },this));
*/

                this.setup_buttons();
                this.update_canvas();
                this.update_canvas_interval = setInterval( _.bind(this.update_canvas,this), 2000 );
            },this));
        },
    });


    jstorrent.VideoView = Backbone.View.extend({
        initialize: function(opts) {
            this.video = this.model.video;
            if (! this.model.file.get('mp4file')) {
                // TODO -- make more efficient for completed files
                if (this.model.file.complete()) {
                    mylog(LOGMASK.warn,'parsing could take a while!');
                }
                this.model.file.parse_stream();
            }
            this.$el.html( $('#video_view_template').html() );
            this.scalevideo = opts.scalevideo;
            this.autostart = opts.autostart;
            this.model.set('scalevideo',this.scalevideo);
            this.model.set('autostart',this.autostart);
            this.$('.video_container')[0].appendChild( this.model.video );
            this.controls_view = new jstorrent.VideoControlsView( { model: this.model } );
            this.$('.controls_container').append( this.controls_view.el );
            this.bind_model_events();
            this.model.on('close', _.bind(function() {
                this.destroy();
            },this));
        },
        destroy: function() {
            this.$el.html('');
        },
        bind_model_events: function() {
            this.model.file.on('change:mp4file', _.bind(function() {
                this.video.load();
            },this));
/*
            this.model.file.on('newpiece', _.bind(function(piecenum) {
                if (piecenum == this.model.file.piece_bounds[1]) {
                    console.log('has last piece!')
                    this.model.trigger('likely_has_metadata');
                }
            },this));*/
            
        }
    });

})();
