<template>
    <div>
        <div class="top">
            <div class="top-bar">
                <div class="cel">
                    <span class="label label-default">{{displayValue("Type")}}</span>
                    <span class="label" :class="'label-' + getStateColour()">{{displayValue("Status")}}</span>
                </div>
                <div class="cel actions">
                    <split-button v-on:action="action('updateStatus')" :title="stateAction">
                        <li v-on:click="action('edit')">Edit Entry</li>
                        <li v-on:click="action('delete')">Delete Entry</li>
                        <li v-on:click="action('move')">Move Entry</li>
                        <li v-on:click="action('permalink')">Get Permalink</li>
                    </split-button>
                </div>
            </div>
            <hr/>
                <h3 class="top-title">{{displayValue("Title")}}</h3>
            <hr/>
        </div>
        <div class="scroll-container">
            <div ref="description" class="description" v-bind:class="{all: expandText}">
                <p v-html="displayValue('Description')"></p>
                <div v-if="showReadMore" class="show-more">
                    <span class="button hollow secondary" v-on:click="toggleExpandText">Show more</span>
                </div>
            </div>
            <h3 class="top-title">Details</h3>
            <hr/>
            <div>
                <div class="row" v-for="field in fieldsToShow">
                    <div class="title columns">{{description(field)}}:</div>
                    <div class="columns small-4">{{displayValue(field)}}</div>
                </div>
            </div>
            <div class="row">
                <div class="columns">
                    <h3 class="top-title">Comments</h3>
                </div>
                <div class="columns action" v-on:click="toggleAddComment">
                    <span>
                        <template v-if="!addComment">
                            <i class="fa fa-plus"></i>
                        </template>
                        <template v-else>
                            <i class="fa fa-minus"></i>
                        </template>
                    </span>
                </div>
            </div>
            <hr/>
            <div>
                <template v-if="addComment">
                    <textarea v-model="newComment" placeholder="new comment"></textarea>
                    <div class="right">
                        <split-button v-on:action="action('saveComment')" title="Save comment">
                            <li v-on:click="action('saveCommentClose')">Save and close entry</li>
                        </split-button>
                    </div>
                </template>
                <template v-for="comment in comments">
                    <div class="comment-header row">
                        <div class="title columns shrink">{{comment.user.wikiname}}</div>
                        <div class="title date columns">{{displayAt(comment.at)}}</div>
                    </div>
                    <div class="comment comment-body row" v-html="comment.comment"></div>
                </template>
                <p/>
            </div>
        </div>
        <div class="bottom-bar">
            <button class="button default" v-on:click="prev"><i class="fa fa-chevron-left"></i></button>
            <button class="button default" v-on:click="next"><i class="fa fa-chevron-right"></i></button>
        </div>
        <div class="pseudo-hidden">
            <input type="text" ref="permalink" v-model="permalink">
        </div>
    </div>
</template>

<script>
import TaskPanelMixin from "../../../mixins/TaskPanelMixin.vue";
import SplitButton from "./SplitButton.vue";
import * as mutations from '../../../store/mutation-types';

/* global $ moment document foswiki */
export default {
    mixins: [TaskPanelMixin],
    data() {
        return {
            expandText: false,
            showReadMore: false,
            addComment: false,
            newComment: '',
            permalink: ''
        };
    },
    components: {
        SplitButton
    },
    computed: {
        stateAction() {
            if(this.isClosed){
                return 'Reopen Entry';
            }
            return 'Close Entry';
        },
        isClosed() {
            let taskStatus = this.task.fields['Status'].value;
            return taskStatus === 'closed';
        },
        comments() {
            if(this.task.changesets){
                return this.task.changesets.filter(function (change) {
                    return change.comment ? true : false;
                }).reverse();
            }
            return {};
        }
    },
    watch: {
        task: 'descriptionHeightExeeded'
    },
    methods: {
        toggleExpandText() {
            this.expandText = !this.expandText;
        },
        toggleAddComment() {
            this.addComment = !this.addComment;
        },
        next() {
            this.$store.commit(mutations.SET_PANEL_NEXT_TASK);
        },
        prev() {
            this.$store.commit(mutations.SET_PANEL_PREV_TASK);
        },
        displayAt(at) {
            return moment.unix(parseInt(at)).format('DD.MM.YYYY - HH:mm');
        },
        getStateColour() {
            let taskStatus = this.task.fields['Status'].value;
            if(taskStatus === 'closed') {
                return 'primary';
            } else {
                return 'info';
            }
        },
        action(type) {
            switch (type) {
                case 'edit':
                    this.$store.dispatch("switchEditMode", true);
                    break;
                case 'saveComment': {
                    let request = {
                        id: this.task.id,
                        comment: this.newComment,
                    };
                    this.$store.dispatch('updateTask', {gridState: this.grid, request});
                    this.addComment = !this.addComment;
                    this.newComment = '';
                    break;
                }
                case 'saveCommentClose': {
                    this.action('saveComment');
                    this.action('updateStatus');
                    break;
                }
                case 'permalink': {
                    let p = foswiki.preferences;
                    let url = [
                        p.SCRIPTURL,
                        '/restauth',
                        p.SCRIPTSUFFIX,
                        '/TasksAPIPlugin/permalink?id=',
                        this.task.id
                    ].join('');
                    this.permalink = url;
                    this.$nextTick(function() {
                        this.$refs.permalink.focus();
                        this.$refs.permalink.setSelectionRange(0, url.length);
                        document.execCommand('copy');
                    });
                    break;
                }
                case 'updateStatus': {
                    let newStatus = 'closed';
                    if (this.isClosed) {
                        newStatus = 'open';
                    }
                    let request = {
                        id: this.task.id,
                        Status: newStatus,
                    };
                    this.$store.dispatch('updateTask', {gridState: this.grid, request});
                    break;
                }
                default:
                    console.warn("Unknown action: " + type);
            }
        },
        descriptionHeightExeeded() {
            this.$nextTick(function() {
                let maxHeight = $(this.$refs.description).css('max-height').split('px')[0];
                let height = $(this.$refs.description).height();
                if(height == maxHeight){
                    this.showReadMore = true;
                } else {
                    this.showReadMore = false;
                }
            });
        }
    },
    mounted() {
        this.descriptionHeightExeeded();
    }
};
</script>

<style lang="sass">
.flatskin-wrapped {
    .panel hr {
        height: 1px;
        width: calc(100% +40px);
        margin-left: -20px;
    }
}
.scroll-container {
    overflow-y: auto;
    height: calc( 100vh - 9.4rem);
    padding: 0px 20px;
    .row .columns {
        padding: 0;
        &.title {
            padding: 5px 0;
            color: darkgray;
            font-size: 0.9rem;
        }
        &.action {
            color: #52cae4;
            text-align: right;
            font-size: 0.9rem;
        }
    }
    .right {
        text-align: right;
    }
}
.top{
    padding: 5px 20px;
}
.pseudo-hidden {
    position: absolute;
    left: -9999px;
    top: -9999px;
}
.top-bar {
    display: flex;
    justify-content: space-between;
    padding: 3px 0;
    .cel {
        flex: 1;
    }
    .actions {
        text-align: right;
    }
}
.comment-header {
    margin-top: 15px;
    padding: 5px 20px;
    border-radius: 5px 5px 0px 0px;
    -moz-border-radius: 5px 5px 0px 0px;
    -webkit-border-radius: 5px 5px 0px 0px;
    border: 0px solid #000000;
    background-color: lightgray;
    color: black;
    &.row  > .columns.title {
        margin-right: 5px;
        color: black;
        &.date {
            font-size: small;
            color: darkgray;
        }
    }
}
.comment-body {
    padding: 10px 20px;
    border-radius: 0px 0px 5px 5px;
    -moz-border-radius: 0px 0px 5px 5px;
    -webkit-border-radius: 0px 0px 5px 5px;
    border: 0px solid #000000;
    background-color: #ebebeb;
    color: black;
}
.description {
    max-height: 250px;
    position: relative;
    overflow: hidden;
    .show-more {
        padding: 6px;
        height: 53px;
        position: absolute;
        bottom: 0;
        width: 100%;
        text-align: center;
        margin: 0;
		background-color: white;
    }
    &.all {
        .show-more {
            position: relative;
        }
        max-height: none;
        overflow: overlay;
    }
}
h3.top-title {
    color: #52cae4;
    margin: 0;
}
.bottom-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    border-top: solid 1px lightgray;
    width: 100%;
    height: 3rem;
    justify-content: center;
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    justify-content: flex-start;
    padding: 0 20px;
    .button {
        padding: 9px 9px 8px 7px;
        margin: 0.5rem 0.2rem;
    }
}
</style>
